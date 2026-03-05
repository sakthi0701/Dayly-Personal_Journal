import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import AiQuestionComponent from './AiQuestionComponent';

export const AiQuestionNode = Node.create({
    name: 'aiQuestion',
    group: 'block',
    content: 'inline*',
    parseHTML() {
        return [
            {
                tag: 'div[data-type="ai-question"]',
            },
        ];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'ai-question' }), 0];
    },
    addNodeView() {
        return ReactNodeViewRenderer(AiQuestionComponent);
    },
});
