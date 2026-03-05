
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(file: File): Promise<string> {
    try {
        // Groq SDK's audio endpoint natively accepts a File object
        const transcription = await groq.audio.transcriptions.create({
            file: file,
            model: "whisper-large-v3-turbo",
            response_format: "text", // Can also be json, verbose_json. We just need the text.
        });

        // When response_format is "text", the returned value might be just the string,
        // but groq-sdk types sometimes still define it as an object with a .text property
        // based on OpenAI SDK parity. 
        if (typeof transcription === 'string') {
            return transcription;
        }
        return transcription.text;
    } catch (error) {
        console.error("Groq Transcription Error:", error);
        throw new Error("Failed to transcribe audio");
    }
}

export async function generateAdvice(
    contextEntries: { content: string }[],
    mode: string = 'Pattern',
    question?: string,
    stats?: any
) {
    const contextText = contextEntries.length > 0
        ? contextEntries.map(e => `- ${e.content}`).join('\n')
        : "No relevant past entries found for this specific context.";

    let modeInstruction = "";
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
        default:
            modeInstruction = `
MODE: GENERAL
Look across their full entry history. Find the single most important thing to say right now.
It could be a pattern, a win, a contradiction, or a quiet warning.
Say it directly. Back it with evidence from their entries. Make it land.`;
    }

    const statsContext = stats ? `
BACKGROUND CONTEXT (secondary only — do not lead with this):
- Journal entries written: ${stats.total_entries}
- Current streak: ${stats.streak_days} days
- Consistency state: ${stats.current_avatar_state === 'sun' ? 'Active' : 'Slipping'}
Only reference this if the journal entries themselves don't tell a clearer story.
The entries are always the primary source of truth. The numbers are just a footnote.
` : "";

    const systemPrompt = `
You are "The Elder."

You have read this person's journal — all of it. You have watched them make the same moves, talk themselves in and out of things, celebrate small wins and quietly bury hard truths. You know their story better than they do right now.

You don't coach. You don't motivate. You don't perform warmth.
You simply tell them what you see — plainly, directly, and with the calm weight of someone who has no reason to lie.

${statsContext}

YOUR RULES:

1. **Speak from evidence.** Every claim you make must come from a specific pattern or moment in their entries. Never speak in generalities.
   - ❌ "You seem to struggle with consistency."
   - ✅ "You've started this habit three times. Each time, you stopped after the second week."

2. **Do not soften the truth.** You are not here to protect their feelings. You are here to wake them up — quietly, not loudly.

3. **Plain language only.** No metaphors. No therapeutic framing. No corporate self-help tone. Talk like a person who has earned the right to be direct.

4. **Never validate for its own sake.** If something is worth acknowledging, it's because the evidence demands it — not because they need a boost.

5. **Be brief.** A long response dilutes the impact. Say the important thing and stop.

6. **If they asked a specific question**, answer it directly using only what their entries actually show. Don't speculate beyond the evidence.

MODE INSTRUCTION:
${modeInstruction}

FORMAT:
- No headers, no bullet points, no numbered lists.
- Write in short, clear paragraphs.
- Maximum 3 paragraphs. Often 2 is better.
- The last sentence should land like a door closing.
`;

    const userMessage = `
Here are my recent relevant journal entries:
${contextText}

${question ? `My question: ${question}` : "What do you see?"}
`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.6, // slightly lower — The Elder doesn't ramble
        });

        return completion.choices[0]?.message?.content || "Unable to generate insights right now. Please try again.";
    } catch (error) {
        console.error("Groq API Error:", error);
        return "Something went wrong while analyzing your entries. Please try again in a moment.";
    }
}

// Helper to summarize if draft is too long (prevent context bloat)
async function summarizeDraftIfNeeded(draft: string): Promise<string> {
    if (draft.length < 1500) return draft;

    const systemPrompt = `Summarize the following journal entry draft into a concise paragraph. Focus on the core emotions, events, and underlying themes.`;
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: draft }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
        });
        return completion.choices[0]?.message?.content?.trim() || draft;
    } catch (e) {
        console.error("Draft summarization failed:", e);
        return draft.substring(0, 1500) + "... [truncated]";
    }
}

export async function generateGoDeeperQuestion(
    currentDraft: string,
    contextEntries: { content: string }[],
): Promise<string> {
    // 1. Summarize if the entry is getting bloated
    const processedDraft = await summarizeDraftIfNeeded(currentDraft);

    // 2. Format past context
    const contextText = contextEntries.length > 0
        ? contextEntries.map(e => `- ${e.content}`).join('\n')
        : "No past entries found. This is a fresh thought.";

    // 3. New 'Gardener / Mentor' System Prompt
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

    const userMessage = currentDraft.trim() === "" ? `
The user is sitting at a blank page. They haven't written anything today.
Looking at the patterns in the past entries above, ask ONE simple, engaging question to break the ice and help them start writing.
` : `
Here is what I am currently writing:
"${processedDraft}"

Based on this draft and my past entries, what is ONE question you can ask me to help me think a little deeper about this?
`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            model: "llama-3.3-70b-versatile",
            // Lowered temperature slightly for more focused, relevant questions
            temperature: 0.6,
        });

        return completion.choices[0]?.message?.content?.trim() || "What is the main thing on your mind right now?";
    } catch (error) {
        console.error("Groq API Error in generateGoDeeperQuestion:", error);
        return "What is one small thing you can focus on today?";
    }
}