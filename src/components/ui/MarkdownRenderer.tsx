"use client";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Simple markdown renderer for MVP.
 * Renders content as pre-formatted text with prose styling.
 * For a production app, use a proper markdown library.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;
  // HTML is escaped first (step 1-3 in simpleMarkdownToHtml), then markdown
  // syntax is converted to known-safe tags. This prevents XSS from content.
  const html = simpleMarkdownToHtml(content);

  return (
    <div
      className="prose-dark text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function simpleMarkdownToHtml(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br/>")
    // Lists (simple)
    .replace(/^- (.+)/gm, "<li>$1</li>");

  // Wrap list items
  html = html.replace(/(<li>.*?<\/li>)+/g, "<ul>$&</ul>");

  return `<p>${html}</p>`;
}
