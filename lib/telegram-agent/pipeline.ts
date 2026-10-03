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
import { supabase } from '@/lib/supabase';
import { generateGoDeeperQuestion } from '@/lib/ai/groq';
import { mem0 } from '@/lib/ai/memory';
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

ROUTING RULES:
• "done X" / "finished X" / "completed X" (habit name) → log_habit(status: success)
• "skipping X" / "won't do X today" → log_habit(status: skipped)
• "failed X" / "couldn't do X" → log_habit(status: failed)
• "done with [task]" / "finished [project]" → complete_task or complete_pressure_task
• "add task" / "new task" / "remind me to" → add_task
• "urgent" / "deadline" / "pressure task" → add_pressure_task
• Reflection / feelings / life update / what happened → log_journal
• "stats" / "my level" / "how am I doing" → get_stats
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

YOUR RULES:
1. Max 3 sentences total. Be brief.
2. No generic praise. If something good happened, name it specifically, then immediately push forward.
3. If a habit was logged → brief specific reaction + ask about the next pending habit or task BY NAME.
4. If a task was completed → acknowledge specifically + name what's next.
5. If journal was logged → your response will have a Sensei question appended automatically. Just output a short 1-sentence acknowledgment.
6. If nothing was actioned (pure chat) → engage directly, nudge toward the most pressing pending item.
7. If all habits are done → celebrate briefly (one sentence), then point at tasks.
8. Use Telegram Markdown: *bold*, _italic_. No headers. No bullet points in your response.
9. Never use "Great job!", "Awesome!", or generic filler words.
10. End with a question or a direct push toward the next action.`;
}

// ── Journal pipeline (with Go Deeper) ─────────────────────────────────────────

async function processJournal(content: string): Promise<{ entryId: string; goDeeperQuestion: string }> {
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

  // Find or create today's plain-text entry
  const { data: todayEntries } = await supabase
    .from('entries')
    .select('id, content')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  const existing = (todayEntries ?? []).find(
    (e) => e.content && !e.content.trimStart().startsWith('<')
  ) ?? null;

  let entryId: string;
  let fullContent: string;

  if (existing) {
    fullContent = `${existing.content}\n\n${timeIST} · ${content}`;
    await supabase.from('entries').update({ content: fullContent }).eq('id', existing.id);
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

  // Fetch Mem0 context for Go Deeper question
  let datedContext: { content: string; date: string }[] = [];
  try {
    const searchResults = await mem0.search(content, { userId: 'default_user', limit: 15 });
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

  const goDeeperQuestion = await generateGoDeeperQuestion(fullContent, datedContext);
  return { entryId, goDeeperQuestion };
}

// ── Background journal work (called via after()) ───────────────────────────────

export async function processJournalBackground(entryId: string, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    await supabase.from('entries').update({ embedding }).eq('id', entryId);
  } catch (e) { console.error('[Pipeline] Embedding failed:', e); }
  try {
    await mem0.add(content, { userId: 'default_user', metadata: { entry_id: entryId } });
  } catch (e) { console.error('[Pipeline] Mem0 add failed:', e); }
}

// ── Conversation history ───────────────────────────────────────────────────────

export async function loadHistory(limit = 6): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from('telegram_messages')
    .select('role, content')
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

  return { response, toolResults, journalEntryId };
}
