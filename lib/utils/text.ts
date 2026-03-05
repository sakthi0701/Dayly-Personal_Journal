/**
 * Strips HTML tags from a string and collapses whitespace.
 * Used to convert Tiptap HTML content into clean plain text
 * before generating embeddings or sending to AI models.
 */
export function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')   // Replace tags with space
        .replace(/&nbsp;/g, ' ')    // Handle HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
}
