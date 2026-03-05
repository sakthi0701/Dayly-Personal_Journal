'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Waves, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import { AiQuestionNode } from '@/app/entries/new/AiQuestionNode'

import VoiceRecorder from '@/components/voice/VoiceRecorder'
import MoodSelector from '@/components/entries/MoodSelector'
import ImageUploader from '@/components/entries/ImageUploader'

interface EntryEditorProps {
    initialContent?: string;
    initialMood?: string | null;
    initialImageUrl?: string | null;
    entryId?: string; // If provided, it's an edit
    onSaveAction: (content: string, mood: string | null, imageUrl: string | null) => Promise<void>;
    hasOnboardedProp?: boolean;
}

export default function EntryEditor({
    initialContent = '',
    initialMood = null,
    initialImageUrl = null,
    entryId,
    onSaveAction,
    hasOnboardedProp = true
}: EntryEditorProps) {
    const router = useRouter()
    const [content, setContent] = useState(initialContent)
    const [mood, setMood] = useState<string | null>(initialMood)
    const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl)
    const [isSaving, setIsSaving] = useState(false)
    const [isGoingDeeper, setIsGoingDeeper] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [hasOnboarded, setHasOnboarded] = useState<boolean>(hasOnboardedProp)
    const [editorReady, setEditorReady] = useState(false)

    // Sync state if prop changes
    useEffect(() => {
        setHasOnboarded(hasOnboardedProp);
    }, [hasOnboardedProp]);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            AiQuestionNode,
            Placeholder.configure({
                placeholder: "What's on your mind today? (Type or Record)",
            }),
            CharacterCount,
        ],
        content: initialContent,
        onCreate: () => {
            setEditorReady(true);
        },
        onUpdate: ({ editor }) => {
            setContent(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-invert prose-p:text-xl prose-p:leading-relaxed prose-p:text-zinc-300 font-serif max-w-none focus:outline-none min-h-[50vh] pb-32',
            },
        },
    });

    // Handle onboarding message injection only for new entries
    useEffect(() => {
        async function checkOnboarding() {
            // Only fetch if we aren't absolutely sure they're onboarded
            // or if we are a completely new, blank entry.
            try {
                const res = await fetch('/api/stats/user')
                if (res.ok) {
                    const data = await res.json()
                    const onboarded = data.stats?.has_onboarded ?? true;
                    setHasOnboarded(onboarded)

                    // If not onboarded and editor is ready, inject the greeting
                    if (!onboarded && editor && !initialContent && !entryId) {
                        editor.chain().focus().insertContent([
                            {
                                type: 'aiQuestion',
                                content: [{ type: 'text', text: "Hello Sakthi. I am your Gardener. I'm an AI companion built into this space. My job is to remember the things you forget, organize your thoughts, and help you reflect when you need it most. Don't overthink it—tell me one thing that is on your mind right now." }],
                            },
                            {
                                type: 'paragraph',
                            }
                        ]).run();
                        setContent(editor.getHTML());
                    }
                }
            } catch (e) {
                console.error("Failed to fetch stats", e)
            }
        }

        // Only run this elaborate check if we suspect it's a first-time use
        // (meaning it's a new entry, and we haven't confirmed they are onboarded)
        if (editorReady && !entryId && !hasOnboarded) {
            checkOnboarding()
        }
    }, [editorReady, editor, entryId, initialContent, hasOnboarded]);

    const handleTranscription = (text: string) => {
        if (!editor) return;
        editor.chain().focus().insertContent(`<p>${text}</p>`).run();
    };

    const handleGoDeeper = async () => {
        const plainText = editor?.getText() || '';
        setIsGoingDeeper(true);
        try {
            const res = await fetch('/api/go-deeper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: plainText })
            });
            const data = await res.json();

            if (data.question) {
                editor?.chain().focus().insertContent([
                    {
                        type: 'aiQuestion',
                        content: [{ type: 'text', text: data.question }],
                    },
                    {
                        type: 'paragraph',
                    }
                ]).run();
            } else {
                alert("Could not generate a question.");
            }
        } catch (error) {
            console.error('Error going deeper:', error);
            alert('Failed to connect to the guide.');
        } finally {
            setIsGoingDeeper(false);
        }
    };

    const handleSave = async () => {
        if (!content.trim()) return

        setIsSaving(true)

        try {
            await onSaveAction(content, mood, imageUrl);

            setShowSuccess(true)
            setTimeout(() => {
                router.push('/entries')
                router.refresh()
            }, 1000)
        } catch (error) {
            console.error('Error saving entry:', error)
            alert('Failed to save entry. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center">
            <div className="w-full max-w-2xl">
                <header className="flex items-center justify-between mb-8">
                    <Link href="/entries" className="text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSave}
                            disabled={isSaving || showSuccess || isGoingDeeper || !content.trim()}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${showSuccess ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-zinc-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : showSuccess ? (
                                <>
                                    <Save className="w-4 h-4" />
                                    Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    {entryId ? 'Update Memory' : 'Save Memory'}
                                </>
                            )}
                        </button>
                    </div>
                </header>

                <MoodSelector selectedMood={mood} onSelect={setMood} />

                <div className="w-full mt-4">
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* Floating Action Dock */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-full shadow-2xl flex items-center gap-2 p-2">
                    <ImageUploader
                        onUploadComplete={setImageUrl}
                        initialImage={imageUrl}
                        onRemove={() => setImageUrl(null)}
                    />

                    <VoiceRecorder onTranscription={handleTranscription} />

                    <button
                        onClick={handleGoDeeper}
                        disabled={isGoingDeeper}
                        className="flex items-center gap-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-full px-4 h-12 font-medium ml-1"
                        title="Analyze my draft and ask a deep follow-up question"
                    >
                        {isGoingDeeper ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Waves className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Go Deeper</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
