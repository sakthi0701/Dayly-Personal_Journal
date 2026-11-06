/**
 * lib/telegram-agent/pipeline.ts
 *
 * Two-tier LLM pipeline for the Dayly Telegram AI Agent.
 *
 * Tier 1 — gpt-oss-20b (router):
 *   Fast, cheap model. Receives snapshot + history + user message.
 *   Outputs tool calls ONLY. No prose.
 *
 * Tier 2 — gpt-oss-120b (Sensei responder):
 *   Smart model. Receives tool results + journal context.
 *   Outputs the final Telegram message in Sensei voice.
 *   Also fires the Go Deeper engine if journal was logged.
 */

import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { generateGoDeeperQuestion } from '@/lib/ai/groq';
import { mem0, searchMemories } from '@/lib/ai/memory';
import { generateEmbedding } from '@/lib/embeddings';
import { stripHtml } from '@/lib/utils/text';
import { toRelativeDate } from '@/lib/utils/date';
import { AGENT_TOOLS, type ToolName } from './tools';
import { executeTools, buildActiveSnapshot, type ToolCall, type ToolResult } from './executor';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PipelineResult {
  response: string;
  toolResults: ToolResult[];
  journalEntryId?: string; // set if log_journal was called — used for background embedding
}

// ── Read User Context ──────────────────────────────────────────────────────────
function getUserContext(): string {
  try {
    const contextPath = path.join(process.cwd(), 'user_context.md');
    return fs.readFileSync(contextPath, 'utf-8');
  } catch (e) {
    return '';
  }
}

// ── System prompts ─────────────────────────────────────────────────────────────

function buildRouterPrompt(
  snapshot: Awaited<ReturnType<typeof buildActiveSnapshot>>,
  istDateTime: string
): string {
  const habitsDone = snapshot.habitsCompleted.length > 0
    ? `Done: ${snapshot.habitsCompleted.join(', ')}`
    : 'None done yet';
  const habitsLeft = snapshot.habitsRemaining.length > 0
    ? `Remaining: ${snapshot.habitsRemaining.join(', ')}`
    : 'All habits complete!';

  return `You are a tool-calling router for the Dayly productivity app.
Your ONLY job: analyze the user message and call the correct tool(s). Output tool calls only — no prose.

CURRENT TIME (IST): ${istDateTime}

ACTIVE STATE:
Habits today → ${habitsDone} | ${habitsLeft}
Top tasks → ${snapshot.topTasks.length > 0 ? snapshot.topTasks.join(' | ') : 'No active tasks'}
Pressure tasks → ${snapshot.topPressure.length > 0 ? snapshot.topPressure.join(' | ') : 'None'}

USER CONTEXT:
${getUserContext()}

ROUTING RULES:
• "done X" / "finished X" / "completed X" (habit name) → log_habits(status: success)
• "skipping X" / "won't do X today" → log_habits(status: skipped)
• "failed X" / "couldn't do X" → log_habits(status: failed)
• "done with [task]" / "finished [project]" → complete_tasks or complete_pressure_tasks
• "add task" / "new task" / "remind me to" → add_tasks
• "urgent" / "deadline" / "pressure task" → add_pressure_tasks
• "log X" / "journal X" / "note that X" (not a habit or task) → log_journal(content: X)
• "today's journal log" / "show my journal" / "what did I write yesterday" → read_journal (NEVER log_journal — asking to see the journal is not an entry)
• Reflection / feelings / life update / what happened → log_journal
• "stats" / "coins" / "how am I doing" → get_stats
• "start a focus timer" / "pomodoro" / "focus N min" → start_focus_timer(minutes, focus_on only if they said what)
• If the last assistant message asked what they are focusing on, the user's reply IS focus_on →
  call start_focus_timer(minutes from that earlier request, focus_on: reply). Do NOT log it as a journal entry.
• "start a break" / "N min break" → start_break_timer
• "stop the timer" / "cancel focus" / "end break" → stop_timer
• "remind me at X" / "set reminder" → set_reminder
• "my reminders" / "show reminders" → list_reminders
• "cancel/delete reminder X" → delete_reminder
• Multiple actions in one message → call multiple tools simultaneously
• Pure chat / question / ambiguous → call NO tools (leave for conversational response)`;
}

function buildResponderPrompt(
  snapshot: Awaited<ReturnType<typeof buildActiveSnapshot>>,
  toolResults: ToolResult[]
): string {
  const actionsTaken = toolResults.map((r) => `• [${r.tool_name}] ${r.summary}`).join('\n');
  const habitsLeft = snapshot.habitsRemaining.length;
  const nextHabit = snapshot.habitsRemaining[0] ?? null;
  const nextTask = snapshot.topTasks[0] ?? null;
  const nextPressure = snapshot.topPressure[0] ?? null;

  return `You are the Sensei — the brutally honest, caring productivity voice inside the Dayly app Telegram bot.

WHAT JUST HAPPENED:
${actionsTaken || '(No tools called — pure conversation)'}

WHAT'S STILL PENDING:
${habitsLeft > 0 ? `Habits remaining today: ${snapshot.habitsRemaining.join(', ')}` : 'All habits done today! ✅'}
${nextTask ? `Next task: ${nextTask}` : 'No pending tasks'}
${nextPressure ? `Top pressure task: ${nextPressure}` : ''}

USER CONTEXT:
${getUserContext()}

YOUR RULES:
1. Be brief: under 80 words. Read on a phone — never one dense paragraph.
2. No generic praise. If something good happened, name it specifically, then immediately push forward.
3. Balance your focus. Do not only ask about habits. If there are pending Pressure Tasks, prioritize pointing those out immediately. If not, point to normal tasks or habits.
4. If a habit was logged → brief specific reaction + ask about the next pending Pressure Task, normal Task, or Habit BY NAME. Note whether a habit is [GOOD] or [BAD] when responding to it.
5. If a task/pressure task was completed → acknowledge specifically + name what's next.
6. If journal was logged → your response will have a Sensei question appended automatically. Just output a short 1-sentence acknowledgment.
7. If nothing was actioned (pure chat) → engage directly, nudge toward the most pressing pending item (prioritizing pressure tasks).
8. Layout: when you mention 2+ items (tasks, habits), put each on its own "- " bullet line,
   grouped under a short *bold* label line (e.g. *Pressure — due today*). Blank line before the closing question.
   A single-item reply stays as 1–2 plain sentences. Use *bold* for item names, _italic_ sparingly. No # headers, no tables.
9. Never use "Great job!", "Awesome!", or generic filler words.
10. End with a question or a direct push toward the next action.
11. If a timer was started → confirm in one line: what, how long, when it ends, and that it's running in the app. No follow-up push.
    If it was not started because one is already running → say so and offer "stop the timer".
12. WHAT'S STILL PENDING is the live database. Chat history can be stale — never list a task or deadline that is not in it.`;
}

// ── Journal pipeline (with Go Deeper) ─────────────────────────────────────────

/**
 * Append a timestamped line to today's (IST) journal entry, creating the entry if needed.
 * Shared by the Telegram agent and Sensei voice calls — keep it free of Telegram-only work.
 */
export async function appendToTodayJournal(content: string): Promise<{ entryId: string; fullContent: string }> {
  const { start, end } = (() => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const midnightIST = new Date(nowIST);
    midnightIST.setUTCHours(0, 0, 0, 0);
    return {
      start: new Date(midnightIST.getTime() - IST_OFFSET_MS).toISOString(),
      end: new Date(midnightIST.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET_MS).toISOString(),
    };
  })();

  const timeIST = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });

  // Append to today's first entry, whether it was written in the app (Tiptap HTML) or
  // from Telegram (plain text). Previously HTML entries were skipped, so Telegram logs
  // landed in a second entry for the same day. Don't reintroduce the plain-text filter.
  const { data: todayEntries } = await supabase
    .from('entries')
    .select('id, content')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true })
    .limit(1);

  const existing = todayEntries?.[0] ?? null;

  let entryId: string;
  let fullContent: string;

  if (existing) {
    const isHtml = (existing.content ?? '').trimStart().startsWith('<');
    fullContent = isHtml
      ? `${existing.content}<p>${escapeHtml(`${timeIST} · ${content}`)}</p>`
      : `${existing.content ?? ''}\n\n${timeIST} · ${content}`;
    const { error } = await supabase.from('entries').update({ content: fullContent }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    entryId = existing.id;
  } else {
    fullContent = `${timeIST} · ${content}`;
    const { data: newEntry, error } = await supabase
      .from('entries')
      .insert({ content: fullContent, created_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    entryId = newEntry.id;
  }

  return { entryId, fullContent };
}

async function processJournal(content: string): Promise<{ entryId: string; goDeeperQuestion: string }> {
  const { entryId, fullContent } = await appendToTodayJournal(content);

  // Fetch Mem0 context for Go Deeper question
  let datedContext: { content: string; date: string }[] = [];
  try {
    const searchResults = await searchMemories(content, 15);
    if (searchResults?.results?.length > 0) {
      datedContext = searchResults.results.map((res: { memory: string; createdAt?: string }) => ({
        content: res.memory,
        date: toRelativeDate(res.createdAt ?? new Date().toISOString()),
      }));
    }
  } catch (e) {
    console.error('[Pipeline] Mem0 search failed:', e);
    // Fallback to recent entries
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('entries').select('content, created_at').gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }).limit(15);
    datedContext = (recent ?? [])
      .map((e) => ({
        content: e.content?.trimStart().startsWith('<') ? stripHtml(e.content) : (e.content ?? ''),
        date: toRelativeDate(e.created_at),
      }))
      .filter((e) => e.content.trim().length > 10);
  }

  const goDeeperQuestion = await generateGoDeeperQuestion(stripHtml(fullContent), datedContext);
  return { entryId, goDeeperQuestion };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Background journal work (called via after()) ───────────────────────────────

export async function processJournalBackground(entryId: string, content: string): Promise<void> {
  try {
    // Embed the whole (merged) entry, not just the new line — the embedding represents the entry
    const { data: entry } = await supabase.from('entries').select('content').eq('id', entryId).single();
    const embedding = await generateEmbedding(stripHtml(entry?.content ?? content));
    await supabase.from('entries').update({ embedding }).eq('id', entryId);
  } catch (e) { console.error('[Pipeline] Embedding failed:', e); }
  try {
    await mem0.add(content, { userId: 'default_user', metadata: { entry_id: entryId } });
  } catch (e) { console.error('[Pipeline] Mem0 add failed:', e); }
}

// ── Conversation history ───────────────────────────────────────────────────────

export async function loadHistory(limit = 6): Promise<ConversationMessage[]> {
  // Only the last 24h: older turns made the LLM restate long-gone tasks as "due today"
  // (e.g. pressure tasks added 5 Oct, deleted since, re-listed on 1 Nov). Don't remove.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('telegram_messages')
    .select('role, content')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as ConversationMessage[]).reverse();
}

export async function saveHistory(role: 'user' | 'assistant', content: string): Promise<void> {
  await supabase.from('telegram_messages').insert({ role, content });
  // Prune old messages: keep last 50
  const { data: old } = await supabase
    .from('telegram_messages')
    .select('id')
    .order('created_at', { ascending: false })
    .range(50, 1000);
  if (old?.length) {
    await supabase.from('telegram_messages').delete().in('id', old.map((r) => r.id));
  }
}

// ── Main pipeline ──────────────────────────────────────────────────────────────

export async function runAgentPipeline(
  userMessage: string,
  istDateTime: string
): Promise<PipelineResult> {
  // Load context in parallel
  const [snapshot, history] = await Promise.all([
    buildActiveSnapshot(),
    loadHistory(6),
  ]);

  // ── Tier 1: Route (gpt-oss-20b) ─────────────────────────────────────────────
  let toolCalls: ToolCall[] = [];
  try {
    const routerMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildRouterPrompt(snapshot, istDateTime) },
      ...history.map((m) => ({ role: m.role, content: m.content }) as Groq.Chat.ChatCompletionMessageParam),
      { role: 'user', content: userMessage },
    ];

    const routerCompletion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: routerMessages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 500,
    });

    toolCalls = (routerCompletion.choices[0]?.message?.tool_calls ?? []) as ToolCall[];
  } catch (err) {
    console.error('[Pipeline] Tier 1 router failed:', err);
    // Continue with no tool calls — Tier 2 will respond conversationally
  }

  // ── Execute tools ────────────────────────────────────────────────────────────
  let toolResults: ToolResult[] = [];
  let journalEntryId: string | undefined;
  let goDeeperQuestion: string | undefined;

  if (toolCalls.length > 0) {
    // Handle journal separately (needs Go Deeper question)
    const journalCall = toolCalls.find((tc) => tc.function.name === 'log_journal');
    const nonJournalCalls = toolCalls.filter((tc) => tc.function.name !== 'log_journal');

    // Run non-journal tools
    if (nonJournalCalls.length > 0) {
      toolResults = await executeTools(nonJournalCalls);
    }

    // Process journal with Go Deeper engine
    if (journalCall) {
      try {
        const args = JSON.parse(journalCall.function.arguments);
        const { entryId, goDeeperQuestion: question } = await processJournal(args.content);
        journalEntryId = entryId;
        goDeeperQuestion = question;
        toolResults.push({
          tool_call_id: journalCall.id,
          tool_name: 'log_journal',
          success: true,
          data: { entry_id: entryId },
          summary: `Journal saved: "${String(args.content).slice(0, 80)}..."`,
        });
      } catch (err) {
        console.error('[Pipeline] Journal processing failed:', err);
        toolResults.push({
          tool_call_id: journalCall.id,
          tool_name: 'log_journal',
          success: false,
          data: {},
          summary: 'Journal save failed.',
        });
      }
    }
  }

  // ── Tier 2: Respond (gpt-oss-120b) ──────────────────────────────────────────

  // Build the message chain for Tier 2 including tool results
  const responderMessages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildResponderPrompt(snapshot, toolResults) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as Groq.Chat.ChatCompletionMessageParam),
    { role: 'user', content: userMessage },
  ];

  // If tools were called, include them in the message chain for context
  if (toolCalls.length > 0) {
    responderMessages.push({
      role: 'assistant',
      content: `I processed these actions: ${toolResults.map((r) => r.summary).join(' | ')}`,
    } as Groq.Chat.ChatCompletionMessageParam);
  }

  let response: string;
  try {
    const responderCompletion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: responderMessages,
      temperature: 0.65,
      max_tokens: 400,
    });
    response = responderCompletion.choices[0]?.message?.content?.trim() ?? 'Done.';
  } catch (err) {
    console.error('[Pipeline] Tier 2 responder failed:', err);
    // Fallback: use tool summaries directly
    response = toolResults.length > 0
      ? toolResults.map((r) => r.summary).join('\n')
      : 'Got it. What else?';
  }

  // Append Go Deeper question if journal was logged
  if (goDeeperQuestion) {
    response = `✅ _Saved._\n\n🧠 *Sensei:* ${goDeeperQuestion}`;
  }

  // Focus timer requested without a target: ask with a fixed question (the router's next turn
  // keys off "what are you focusing on" in history to complete the call — keep the wording).
  const focusQuestion = toolResults.find((r) => r.tool_name === 'start_focus_timer' && r.data.needs_focus_on);
  if (focusQuestion) {
    response = `🎯 ${focusQuestion.data.minutes}-min focus. What are you focusing on?`;
  }

  // Journal read-back is sent verbatim — the responder's 80-word limit would summarise it away
  const journalRead = toolResults.find((r) => r.tool_name === 'read_journal' && r.success);
  if (journalRead) {
    response = journalRead.data.found
      ? `📓 *${journalRead.data.label}'s journal*\n\n${journalRead.data.text}`
      : `📓 Nothing in your journal for ${journalRead.data.label} yet.`;
  }

  return { response, toolResults, journalEntryId };
}
