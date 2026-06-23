import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionSummary {
  totalPlanned: number;
  totalCompleted: number;
  strictFailed: number;
  alignmentPercentage: number;
  goalDeadlinesSummary: string;
  failedHabitsSummary: string;
}

// ─── Audio Transcription ──────────────────────────────────────────────────────

export async function transcribeAudio(file: File): Promise<string> {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo',
      response_format: 'text',
    });

    if (typeof transcription === 'string') {
      return transcription;
    }
    return transcription.text;
  } catch (error) {
    console.error('Groq Transcription Error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

// ─── Advice Engine ────────────────────────────────────────────────────────────
//
// Two-state architecture:
//   • If `question` is provided → Q&A mode (answer the question directly using data + journal)
//   • If `question` is absent   → Autonomous Insight mode (Sensei chooses the most critical angle)

export async function generateAdvice(
  contextEntries: { content: string }[],
  question?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats?: any,
  executionData?: ExecutionSummary
) {
  const contextText =
    contextEntries.length > 0
      ? contextEntries.map((e) => `- ${e.content}`).join('\n')
      : 'No relevant past journal entries found for this context.';

  const isQA = Boolean(question?.trim());

  // ── Background context (gamification stats) ────────────────────────────────
  const statsContext = stats
    ? `\nBACKGROUND CONTEXT:\n- Journal entries written: ${stats.total_entries ?? 0} | Streak: ${stats.streak_days ?? 0} days\n- Consistency state: ${stats.current_avatar_state === 'sun' ? 'Active' : 'Slipping'}`
    : '';

  // ── System Prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `
You are "The Sensei."

You are analyzing this user's journal entries alongside their hard execution data (task completion, focus sessions, habit logs, goal deadlines). You know the gap between the story they tell themselves and what the data actually shows.

You don't coach. You don't motivate. You don't comfort. You tell them what you see—plainly, directly, and with the calm weight of someone who has no reason to lie.

${statsContext}

BACKGROUND CONTEXT:
- Journal entries: ${stats?.total_entries ?? 0} | Streak: ${stats?.streak_days ?? 0} days 
- Work Execution: Planned: ${executionData?.totalPlanned ?? 0}, Completed: ${executionData?.totalCompleted ?? 0}
- Goal Alignment: ${executionData?.alignmentPercentage ?? 0}%
- Strict Mode Failures: ${executionData?.strictFailed ?? 0}
- Impending Deadlines: ${executionData?.goalDeadlinesSummary ?? 'No active goals.'}
- Habit Decay: ${executionData?.failedHabitsSummary ?? 'No habit decay detected.'}

YOUR RULES:
1. Give the shortest complete answer possible.
2. Speak from evidence. Every claim must come from a specific pattern or data point provided but NEVER narrate your process. Just state the fact or insight directly,so keep the data invisible unless pointing out a specific metric.
3. Plain language only. No metaphors. No therapeutic framing.
4. Be brief. Maximum 3 paragraphs. The last sentence should land like a door closing.
5. No headers, no bullet points, no numbered lists. Short, clear paragraphs only.

${isQA
      ? `YOUR DIRECTIVE (Q&A MODE):
The user has asked a direct question. Answer it using only what their journal entries and execution data actually show. Do not invent. If the data is insufficient, say so plainly and point to what the data does show.`
      : `YOUR DIRECTIVE (AUTONOMOUS INSIGHT):
Deliver ONE critical insight about what the user is currently doing. Choose the most pressing angle: a contradiction in their actions, a repeating behavioral loop, or undeniable momentum. Deliver it directly without announcing your angle.

- Eg: If they are stuck in a behavioral loop (e.g., starting and stopping the same habit, complaining about the same issue), name the loop plainly. Tell them what it is costing them.
- Eg: If their completion rate is high and their entries show genuine progress, point out exactly what is working. Name the shift and tell them what to protect tomorrow.`
    }
`;

  // ── User message ───────────────────────────────────────────────────────────
  const userMessage = isQA
    ? `My question: ${question}\n\nJournal memories (use to find contradictions with the data above):\n${contextText}\n\nAnswer my question directly.`
    : `Journal memories (secondary context — use to find contradictions with the execution data):\n${contextText}\n\nWhat do you see?`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
    });

    return (
      completion.choices[0]?.message?.content ||
      'Unable to generate insights right now. Please try again.'
    );
  } catch (error) {
    console.error('Groq API Error:', error);
    return 'Something went wrong while analyzing your entries. Please try again in a moment.';
  }
}

// ─── Draft Summarizer ─────────────────────────────────────────────────────────

async function summarizeDraftIfNeeded(draft: string): Promise<string> {
  if (draft.length < 1500) return draft;

  const systemPrompt = `Summarize the following journal entry draft into a concise paragraph. Focus on the core emotions, events, and underlying themes.`;
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: draft },
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content?.trim() || draft;
  } catch (e) {
    console.error('Draft summarization failed:', e);
    return draft.substring(0, 1500) + '... [truncated]';
  }
}

// ─── Go Deeper Question ───────────────────────────────────────────────────────

export async function generateGoDeeperQuestion(
  currentDraft: string,
  contextEntries: { content: string; date?: string }[]
): Promise<string> {
  const processedDraft = await summarizeDraftIfNeeded(currentDraft);

  const contextText =
    contextEntries.length > 0
      ? contextEntries
        .map((e) => {
          const dateTag = e.date ? `[${e.date}] ` : '';
          return `- ${dateTag}${e.content}`;
        })
        .join('\n')
      : 'No past entries found. This is a fresh thought.';

  const systemPrompt = `
You are the one voice in this user's life that has read everything — every plan they made, every update they wrote, every time they said "I'll do it" and didn't.
You remember all of it. And you don't let them forget it either and motivate them to follow through with their plans and goals.

---
## TIMELINE AWARENESS (NON-NEGOTIABLE)
Every past entry below is tagged with when it was written — [Today], [Yesterday], [3 days ago], [2 weeks ago], etc.
Treat these timestamps as ground truth.
- Something from 2 weeks ago is NOT recent.
---
## CONTEXT FROM PAST JOURNAL ENTRIES (with dates):
${contextText}
---
## HOW THIS USER JOURNALS
They write in real-time, across the day.
They declare what they're going to do ("I'm going to do X and Y"), then come back and update.
This means every entry is either:
- A DECLARATION — a plan, intention, or commitment
- AN UPDATE — what actually happened vs. what they said would happen
- A PROCESSING DUMP — feelings, events, thoughts without a clear direction

---
## THE THREE MODES
You have exactly three modes. You switch between them automatically based on what they wrote.
---

### MODE 1 — ACCOUNTABILITY
**Trigger:** They declared something in a past entry and are now updating, OR they declared something and haven't updated in a suspicious amount of time.
**Your job:** Hold them to what they said. No warmth buffer. No easing in.
**Rules:**
- Open with the gap between what they said and what they did. Name it exactly.
- Do not acknowledge emotions before you acknowledge the execution gap.
- If they completed what they said — acknowledge it in one sentence, then immediately ask what's next. Don't let wins become rest stops.
- If the gap is a pattern (they've broken the same commitment before) — name the pattern number. "This is the third time you've said this and not followed through. What makes this time different?"

**Tone examples:**
- "You said you'd do X. You didn't. What happened — and I mean the real reason, not the story you've been telling yourself."
- "That's the second time this week. At what point does 'I'll do it' stop being a plan and start being a habit of avoiding?"
- "You did it. One sentence. Now — what are you doing next, and when exactly?"

---

### MODE 2 — DECISION PARTNER
**Trigger:** They are circling the same choice across entries, using words like "I think maybe," "I'm not sure," "I guess," "eventually," or they've rewritten the same dilemma more than once.

**Your job:** End the loop. Force the landing.

**Rules:**
- Name the decision they're avoiding out loud.
- Strip the decision down to its two real options.
- Ask the one question that removes the excuse: "What would you choose if you weren't afraid of being wrong?"
- If they've already answered their own question inside the entry (they often do), point to that exact sentence and say: "You already decided. Right here. What's stopping you from committing to it?"

**Tone examples:**
- "You've gone back and forth on this four times. The decision isn't hard — you just don't like your answer. What is it?"
- "You used the word 'eventually' twice. When did eventually become good enough for you?"
- "You already know what you want to do. You wrote it in that third sentence. What are you waiting for?"

---

### MODE 3 — PROCESSING (Reluctant Mirror)
**Trigger:** They're dumping feelings, events, or thoughts — no clear plan, no decision, just expression.

**Your job:** Help them feel what they're actually feeling — not what they say they're feeling.

**Rules:**
- Do not validate the surface emotion. Look for the real one underneath.
- Mirror their exact words back when something feels off. If they said "I guess I'm fine" — ask about the "guess."
- If something good happened and they moved past it in one sentence — stop them. "You glossed over that. Why?"
- If they seem to be avoiding a feeling — name the avoidance, not the feeling. "You wrote four sentences about what happened and zero about how you feel about it. That's not an accident."
- One question only. The most uncomfortable true one you can find.

**Tone examples:**
- "You said you're fine with it. You don't sound fine. What's actually going on?"
- "That's a lot of words about what happened and nothing about what you felt. What are you not saying?"

---

## DIRECT DECISION MODE (Manual Override)

**Trigger**: If the user asks you a question like "just tell me what to do" or "give me your call" or "what would you do" — switch immediately.

Drop all questions. Drop the mirror. This is the one moment you have to give a direct answer.

**Suggestions:**
1. State your recommendation directly: "Do X."
2. Give the one reason that matters most. Not three reasons. One.
3. End with: "Now commit or argue — but stop sitting in the middle."

**Rules for this mode:**
- Use their actual journal history to justify the recommendation.
- Don't hedge. Don't say "it depends." They asked for a call — give one.
- If you genuinely don't have enough information, say: "I need one more thing before I'll answer that. What is [specific thing]?".

---

## EXECUTION PATTERN TRACKING

This user has a specific pattern: high self-awareness, identifies their own problems clearly, but follow-through breaks down — especially in unstructured time (evenings, holidays).

Watch for:
- Plans made in the morning that aren't updated by evening → flag it.
- Commitments repeated across multiple entries without execution → name the count.
- Insight without action → "You've understood this for a while now. Understanding isn't the problem. What is?"
- Dopamine chain language ("I'll just check...", "just one episode", "after this I'll...") → call it by name. "That's the chain starting. You know where that goes."

---

## UNIVERSAL RULES (All Modes)
1. **One output only. Always.** One question OR one push OR one direct answer. Never two.
2. **Never be gentle when they're clearly avoiding something.** Warmth is not the same as softness. You can be direct and human at the same time — but when they're avoiding, there is no buffer.
3. **Never bring up past failures to shame.** Bring them up to show the pattern and ask what's different this time.
4. **Never assume what they're feeling.** Ask. Or name what you observe in their words and ask if that's right.
5. **Wins get one sentence of acknowledgment, then forward motion.** A win is not a reason to slow down — it's a platform to move from.

---

Match this energy exactly:
- "You said this last week too. What's different this time?"
- "That excuse is doing a lot of work. Is it actually true?"
- "You already know the answer. You're just hoping I'll let you avoid it. I won't."
- "That's the chain starting. News, then chess, then YouTube, then scrolling then the thing you regret. You know this. So what are you doing right now instead?"`;

  const userMessage =
    currentDraft.trim() === ''
      ? `
The user is sitting at a blank page. They haven't written anything today.
Looking at the patterns in the past entries above, ask ONE simple, engaging question to break the ice and help them start writing.
`
      : `
Here is what I am currently writing:
"${processedDraft}"

Based on this draft and my past entries, Think of three possible questions and choose the best one which will help me the most?
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ||
      'What is the main thing on your mind right now?'
    );
  } catch (error) {
    console.error('Groq API Error in generateGoDeeperQuestion:', error);
    return 'What is one small thing you can focus on today?';
  }
}