
import { NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/ai/groq';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        console.log(`Starting transcription request for processed file: ${file.name}`);
        const text = await transcribeAudio(file);

        return NextResponse.json({ text });

    } catch (error: any) {
        console.error("Transcription API Error:", error);
        return NextResponse.json({
            error: "Transcription failed",
            details: error.message || String(error)
        }, { status: 500 });
    }
}
