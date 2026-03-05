
'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
    onTranscription: (text: string) => void;
}

export default function VoiceRecorder({ onTranscription }: VoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [failedAudio, setFailedAudio] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const startRecording = async () => {
        try {
            setFailedAudio(null); // Clear any previous failed state
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                await processAudio(audioBlob);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsProcessing(true);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const processAudio = async (blob: Blob) => {
        setIsProcessing(true);
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');

        try {
            const res = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (data.text) {
                onTranscription(data.text);
                setFailedAudio(null); // Success, clear Blob
            } else {
                console.error("Transcription failed:", data.error);
                setFailedAudio(blob); // Save Blob for retry
            }
        } catch (err) {
            console.error("Upload error:", err);
            setFailedAudio(blob); // Save Blob for retry
        } finally {
            setIsProcessing(false);
            setRecordingTime(0);
        }
    };

    return (
        <div className="flex items-center justify-center">
            {!failedAudio ? (
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                    className={`
                        relative group flex items-center justify-center transition-all duration-300 ease-in-out
                        ${isRecording
                            ? 'bg-red-500 rounded-full w-24 h-12 shadow-lg shadow-red-500/50'
                            : 'bg-zinc-800 hover:bg-zinc-700 rounded-full w-12 h-12'}
                        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    {isRecording && (
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                    )}

                    {isProcessing ? (
                        <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                    ) : isRecording ? (
                        <div className="flex items-center gap-2 z-10 px-2 justify-center w-full">
                            <Square className="w-4 h-4 text-white fill-current flex-shrink-0" />
                            <span className="text-white font-mono text-sm font-bold tracking-wider">{formatTime(recordingTime)}</span>
                        </div>
                    ) : (
                        <Mic className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors z-10" />
                    )}
                </button>
            ) : (
                <div className="flex items-center gap-2 bg-red-950/40 border border-red-900 rounded-full px-4 h-12 absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="text-red-400 text-sm font-medium">Upload failed</span>
                    <button
                        onClick={() => processAudio(failedAudio)}
                        disabled={isProcessing}
                        className="text-white bg-red-600 hover:bg-red-500 px-3 py-1 rounded-full text-xs disabled:opacity-50 transition-colors ml-2"
                    >
                        {isProcessing ? 'Retrying...' : 'Retry'}
                    </button>
                    <button
                        onClick={() => setFailedAudio(null)}
                        disabled={isProcessing}
                        className="text-zinc-400 hover:text-white text-xs transition-colors p-2"
                    >
                        <Square className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
