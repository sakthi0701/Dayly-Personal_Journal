'use client';

import { useState } from 'react';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ImageUploader({
    onUploadComplete,
    initialImage = null,
    onRemove
}: {
    onUploadComplete: (url: string) => void;
    initialImage?: string | null;
    onRemove: () => void;
}) {
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
            const filePath = `entries/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('entry_images')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage
                .from('entry_images')
                .getPublicUrl(filePath);

            const publicUrl = data.publicUrl;
            setPreviewUrl(publicUrl);
            onUploadComplete(publicUrl);

        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Failed to upload image. Ensure the entry_images bucket exists and is public.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = () => {
        setPreviewUrl(null);
        onRemove();
    };

    return (
        <div className="relative flex items-center justify-center">
            {!previewUrl ? (
                <label className="flex items-center justify-center w-12 h-12 bg-zinc-800 hover:bg-zinc-700 rounded-full cursor-pointer transition-colors text-zinc-400 hover:text-white">
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isUploading}
                    />
                </label>
            ) : (
                <>
                    {/* The small indicator in the dock */}
                    <button
                        onClick={handleRemove}
                        className="flex items-center justify-center w-12 h-12 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700 relative group"
                    >
                        <img
                            src={previewUrl}
                            alt="Attachment mini preview"
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-30 transition-opacity"
                        />
                        <X className="w-4 h-4 text-white absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>

                    {/* The popup preview above the dock */}
                    <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 select-none pointer-events-none">
                        <img
                            src={previewUrl}
                            alt="Attachment preview"
                            className="h-40 rounded-xl border border-zinc-700 shadow-2xl object-cover"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
