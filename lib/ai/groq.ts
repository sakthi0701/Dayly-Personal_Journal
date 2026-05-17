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

export async function generateAdvice(
  contextEntries: { content: string }[],
  mode: string = 'General',
  question?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats?: any,
  executionData?: ExecutionSummary
) {
  const contextText =
    contextEntries.length > 0
      ? contextEntries.map((e) => `- ${e.content}`).join('\n')
      : 'No relevant past journal entries found for this context.';

  // ── Mode Instructions ──────────────────────────────────────────────────────
  let modeInstruction = '';

  switch (mode) {
    case 'Pattern':
      modeInstruction = `
MODE: PATTERN
Your job is to name the loop they are stuck in — clearly and without softening it.
Find the behavior, thought, or situation that keeps appearing across their entries.
Name it plainly. Then tell them what it is costing them.
- DO: "You have written about this same situation four times. Each time, you do the same thing."
- DON'T: "It seems like you might have a tendency to..."
End with ONE question that forces them to confront the pattern directly.`;
      break;

    case 'Momentum':
      modeInstruction = `
MODE: MOMENTUM
Your job is to find what is actually moving — and make them see it clearly.
Not generic praise. Specific evidence from their entries that something is working or shifting.
Name the exact thing. Tell them why it matters. Tell them what to protect.
- DO: "Three weeks ago you couldn't finish a session. Now you're going longer each time. That's not luck."
- DON'T: "You're doing great! Keep it up!"
End with ONE concrete thing they should do tomorrow to protect this momentum.`;
      break;

    case 'Sensei': {
      // This mode uses the execution data as the primary source — journal is secondary
      const exec = executionData;
      const completionRate =
        exec && exec.totalPlanned > 0
          ? Math.round((exec.totalCompleted / exec.totalPlanned) * 100)
          : 0;

      modeInstruction = `
MODE: HOLISTIC EXECUTION AUTOPSY (Sensei)

Here is this user's reality for the last 7 days — this is HARD DATA, not their self-perception:
- Work Execution: Planned pomodoros: ${exec?.totalPlanned ?? 0}. Completed: ${exec?.totalCompleted ?? 0} (${completionRate}% completion rate).
- Strict Mode Failures: ${exec?.strictFailed ?? 0} sessions destroyed by tab-switching or distraction.
- Goal Alignment: ${exec?.alignmentPercentage ?? 0}% of this week's tasks were linked to their active long-term goals. The rest were orphan tasks — busy work.
- Impending Deadlines: ${exec?.goalDeadlinesSummary ?? 'No active goals set.'}
- Habit Decay: ${exec?.failedHabitsSummary ?? 'No habit decay detected.'}

Cross-reference this execution record with their private journal entries below. Your task:
1. Find the CONTRADICTION between what they say they want (goals/journals) and what they are ACTUALLY doing (execution/habits).
2. Are they completing tasks but letting their health or habits decay silently?
3. Are they busy with orphan zero-priority tasks while a major goal deadline approaches?
4. Are they claiming discipline in the journal but their strict mode numbers tell a different story?

Do NOT comfort the user. Do NOT praise consistency you do not see in the data.
Name the avoidance pattern by its exact shape. Ask the ONE uncomfortable question they are actively avoiding.
Ground EVERY observation in the hard data above AND their journal entries — never speak in generalities.
Max 3 paragraphs. The final sentence lands hard and demands reflection. No softening.`;
      break;
    }

    case 'Task-Audit': {
      const exec = executionData;
      modeInstruction = `
MODE: TASK AVOIDANCE AUDIT

This user's task execution data for the last 7 days:
- Goal alignment: ${exec?.alignmentPercentage ?? 0}% of tasks linked to a real goal.
- ${100 - (exec?.alignmentPercentage ?? 0)}% were orphan tasks — activity disguised as productivity.
- Active goal deadlines approaching: ${exec?.goalDeadlinesSummary ?? 'None set.'}

Cross-reference with their journal: what do they CLAIM to be building or working toward?
Then look at whether their actual daily tasks move ANY of those stated priorities forward.
Name the specific tasks or categories they are hiding behind. Tell them what the orphan-task habit is protecting them from.
End with ONE question about the goal they are most clearly avoiding right now.`;
      break;
    }

    default:
      modeInstruction = `
MODE: GENERAL
Look across their full entry history. Find the single most important thing to say right now.
It could be a pattern, a win, a contradiction, or a quiet warning.
Say it directly. Back it with evidence from their entries. Make it land.`;
  }

  // ── Background context (gamification stats) ────────────────────────────────
  const statsContext = stats
    ? `
BACKGROUND CONTEXT (secondary — do not lead with this):
- Journal entries written: ${stats.total_entries}
- Current streak: ${stats.streak_days} days
- Consistency state: ${stats.current_avatar_state === 'sun' ? 'Active' : 'Slipping'}
Only reference this if the journal entries or execution data don't tell a clearer story.`
    : '';

  // ── System Prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `
You are "The Sensei."

You have read this person's journal — all of it. You have watched them make the same moves, talk themselves in and out of things, celebrate small wins and quietly bury hard truths. You also see their execution record: their task completion, their focus sessions, their habit logs, and their goal deadlines. You know their story better than they do right now — and you know the gap between the story they tell themselves and the one the data shows.

You don't coach. You don't motivate. You don't perform warmth. You don't comfort. You simply tell them what you see — plainly, directly, and with the calm weight of someone who has no reason to lie.

${statsContext}

YOUR RULES:

1. **Speak from evidence.** Every claim must come from a specific pattern, data point, or moment in their entries or execution record. Never speak in generalities.
   - ❌ "You seem to struggle with consistency."
   - ✅ "You've started this habit three times. Each time, you stopped after the second week. The data shows you failed it 4 of the last 7 days."

2. **Do not soften the truth.** You are not here to protect their feelings. You are here to wake them up — quietly, not loudly.

3. **Plain language only.** No metaphors. No therapeutic framing. No corporate self-help tone. Talk like a person who has earned the right to be direct.

4. **Never validate for its own sake.** If something is worth acknowledging, it's because the evidence demands it — not because they need a boost.

5. **Be brief.** A long response dilutes the impact. Say the important thing and stop.

6. **Cross-reference ruthlessly.** When you have execution data, find the gap between what they journal about wanting and what their task/habit/focus data shows they actually do.

7. **If they asked a specific question**, answer it directly using only what their entries and data actually show.

MODE INSTRUCTION:
${modeInstruction}

FORMAT:
- No headers, no bullet points, no numbered lists.
- Write in short, clear paragraphs.
- Maximum 3 paragraphs. Often 2 is better.
- The last sentence should land like a door closing.
`;

  // For Sensei and Task-Audit, execution data goes BEFORE journal entries
  const isSenseiMode = mode === 'Sensei' || mode === 'Task-Audit';
  const userMessage = isSenseiMode
    ? `
${question ? `My question: ${question}\n\n` : ''}Journal memories (secondary context — use to find contradictions with the data above):
${contextText}

What do you see?
`
    : `
Here are my recent relevant journal entries:
${contextText}

${question ? `My question: ${question}` : 'What do you see?'}
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: mode === 'Sensei' || mode === 'Task-Audit' ? 0.5 : 0.6,
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
You are "The Witness."

You have read what the user just wrote. You noticed something — a contradiction, an avoidance, a word they used once and quickly moved past, a feeling they named but didn't explain.

Your only job is to ask ONE question about it.

---

CONTEXT FROM THEIR PAST JOURNAL ENTRIES:
${contextText}

---

YOUR RULES:

1. **Find the thing they skipped over.** The moment in the entry where the writing got vague, rushed, or suddenly changed subject. That's where you point.

2. **Be plain and direct.** Write like a person, not a poet. No metaphors. No flowery language. Simple words only.
   - ❌ "What shadow are you afraid to illuminate?"
   - ✅ "Why did you stop talking about that part?"

3. **Use their exact words when it creates friction.**
   - If they wrote "it's fine" — ask about "fine."
   - If they wrote "I just don't care anymore" — ask what "anymore" means.

4. **Use past entry patterns to expose contradictions.**
   - If they've written about this before but differently, point at the gap.
   - e.g. "Last time this happened you said you were angry. This time you said nothing. What changed?"

5. **One question. Never two.** Not a question with a second question hiding inside it.

6. **The question should feel slightly uncomfortable.** Like it saw something they hoped nobody noticed. Not cruel — just precise.

7. **Never:**
   - Start with "I"
   - Give advice or validation
   - Say anything before or after the question
   - Use poetic, abstract, or therapeutic language
   - Ask about other people's behavior — only the user's

---

TONE EXAMPLES (match this exactly):
- "You said you were okay with it. Were you?"
- "You mentioned your dad once and then immediately changed the subject. Why?"
- "What are you not writing down?"
- "You used the word 'fine' three times. What would the honest word be?"
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