// Singleton for the model
let transcriber: any = null;

async function getTranscriber() {
    if (!transcriber) {
        console.log('[Whisper] Initializing pipeline...');
        // Dynamic import for Next.js server-side
        const { pipeline, env } = await import('@xenova/transformers');

        // Settings to avoid browser/local model issues
        env.allowLocalModels = false;
        env.useBrowserCache = false;

        // Use 'Xenova/whisper-tiny.en' for speed, or 'base.en' for better accuracy
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        console.log('[Whisper] Pipeline ready.');
    }
    return transcriber;
}

export async function transcribeLocal(audioData: Float32Array): Promise<string> {
    try {
        console.log(`[Whisper] Processing pre-decoded audio (${audioData.length} samples)`);

        // Diagnostic: check if audio has any signal
        const maxAmplitude = audioData.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        console.log(`[Whisper] Max amplitude from browser: ${maxAmplitude.toFixed(4)}`);

        if (maxAmplitude < 0.0001) {
            console.warn('[Whisper] WARNING: Audio is basically absolute silence!');
        } else if (maxAmplitude < 0.9) {
            // Normalize audio to -1.0 to 1.0
            const scale = 1.0 / maxAmplitude;
            for (let i = 0; i < audioData.length; i++) {
                audioData[i] *= scale;
            }
        }

        // Run Transcription
        const pipeline = await getTranscriber();

        console.log(`[Whisper] Running pipeline...`);
        const output = await pipeline(audioData, {
            sampling_rate: 16000,
            return_timestamps: false,
            language: 'english',
            task: 'transcribe',
        });

        console.log("[Whisper] Result:", output);

        const text = Array.isArray(output) ? output.map(c => c.text).join(' ') : output.text;
        return text.trim();

    } catch (error) {
        console.error("[Whisper] Error:", error);
        throw error;
    }
}
