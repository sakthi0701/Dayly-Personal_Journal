import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Waves } from 'lucide-react';

export default function AiQuestionComponent() {
    return (
        <NodeViewWrapper className="ai-question my-6 p-6 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl relative shadow-lg shadow-indigo-900/20">
            <div className="flex items-center gap-3 mb-3 select-none" contentEditable={false}>
                <Waves className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-widest">Guide</h3>
            </div>
            <NodeViewContent className="text-xl font-serif text-indigo-100 leading-relaxed outline-none" />
        </NodeViewWrapper>
    );
}
