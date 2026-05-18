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
  contextEntries: { content: string }[]
): Promise<string> {
  const processedDraft = await summarizeDraftIfNeeded(currentDraft);

  const contextText =
    contextEntries.length > 0
      ? contextEntries.map((e) => `- ${e.content}`).join('\n')
      : 'No past entries found. This is a fresh thought.';

  const systemPrompt = `
You are "The Analyst."
You have read what the user just wrote. You noticed something — a core emotion they are minimizing, a pattern repeating itself, or a sudden shift in their narrative. 
Your only job is to ask ONE question to help them process what they are actually feeling, rather than what they are just reporting.
---

CONTEXT FROM THEIR PAST JOURNAL ENTRIES:
${contextText}

---
YOUR RULES:
1. **Find the emotional gap.** Look for the moment the writing becomes intellectualized, detached, rushed, or where a heavy statement is brushed off as a minor detail. Point gently but firmly at that gap.
2. **Be plain and direct.** Write like a human psychologist. No metaphors. No flowery language. No generic AI empathy ("I'm so sorry you feel that way"). 
   - ❌ "What shadows are dancing behind that thought?"
   - ✅ "You said you 'moved on,' but you're writing about it again. What's lingering?"
3. **Mirror their exact words.**
   - If they wrote "I guess it's fine" — ask about the "guess" or the "fine."
   - If they wrote "I just need to work harder" — ask what "working harder" is protecting them from.
4. **Use past entry patterns to connect the dots.**
   - If they are repeating a cycle from past entries, bring it to their attention.
   - e.g., "Last month you felt this exact same burnout. What boundary was crossed this time?"
5. **One question. Never two.** Not a question with a second question hiding inside it.
6. **The tone should feel curious and non-judgmental, yet penetrating.** It should feel like a safe but challenging space. You are holding up a mirror, not pointing a finger.
7. **Never:**
   - Start with "I"
   - Give advice, try to "fix" their problem, or offer forced validation
   - Say anything before or after the question
   - Ask about other people's motives — only focus on the user's internal experience.
---

TONE EXAMPLES (match this exactly):
- "You wrote a lot about what happened, but nothing about how it made you feel. Why is that?"
- "You keep using the word 'should' instead of 'want.' Whose expectation is that?"
- "This sounds very similar to how you described the situation in March. Do you feel stuck in a loop?"
- "You brushed past that disappointment very quickly. Can we pause there for a second?"
`;

  const userMessage =
    currentDraft.trim() === ''
      ? `
The user is sitting at a blank page. They haven't written anything today.
Looking at the patterns in the past entries above, ask ONE simple, engaging question to break the ice and help them start writing.
`
      : `
Here is what I am currently writing:
"${processedDraft}"

Based on this draft and my past entries, what is ONE question you can ask me to help me think a little deeper about this?
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