import type { JSONContent } from '@tiptap/react';

/**
 * Converts a markdown string into TipTap-compatible JSONContent.
 * Supports headings, bold, italic, strikethrough, code, links,
 * bullet/ordered/task lists, code blocks, blockquotes, horizontal rules, and images.
 */
export function markdownToJSON(markdown: string): JSONContent {
  const lines = markdown.split('\n');
  const doc: JSONContent = { type: 'doc', content: [] };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      doc.content!.push({
        type: 'codeBlock',
        attrs: { language: lang || null },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      doc.content!.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      doc.content!.push({
        type: 'heading',
        attrs: { level },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const innerContent = markdownToJSON(quoteLines.join('\n'));
      doc.content!.push({
        type: 'blockquote',
        content: innerContent.content || [],
      });
      continue;
    }

    // Task list
    const taskMatch = line.match(/^(\s*)- \[([ x])\]\s+(.*)$/);
    if (taskMatch) {
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const tm = lines[i].match(/^(\s*)- \[([ x])\]\s+(.*)$/);
        if (!tm) break;
        items.push({
          type: 'taskItem',
          attrs: { checked: tm[2] === 'x' },
          content: [{ type: 'paragraph', content: parseInline(tm[3]) }],
        });
        i++;
      }
      doc.content!.push({ type: 'taskList', content: items });
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch && !line.match(/^(\s*)- \[([ x])\]/)) {
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)[-*+]\s+(.*)$/);
        if (!m || lines[i].match(/^(\s*)- \[([ x])\]/)) break;
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(m[2]) }],
        });
        i++;
      }
      doc.content!.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (olMatch) {
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(m[2]) }],
        });
        i++;
      }
      doc.content!.push({ type: 'orderedList', content: items });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (default)
    doc.content!.push({
      type: 'paragraph',
      content: parseInline(line),
    });
    i++;
  }

  if (!doc.content || doc.content.length === 0) {
    doc.content = [{ type: 'paragraph' }];
  }

  return doc;
}

function parseInline(text: string): JSONContent[] {
  const tokens: JSONContent[] = [];
  if (!text) return tokens;

  // Regex for inline patterns: images, links, bold, italic, strikethrough, inline code
  const inlineRegex = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|~~(.+?)~~/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add any preceding plain text
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      // Image: ![alt](src)
      tokens.push({
        type: 'text',
        text: match[1] || 'image',
        marks: [{ type: 'link', attrs: { href: match[2], target: '_blank', rel: 'noopener noreferrer' } }],
      });
    } else if (match[3] !== undefined) {
      // Link: [text](url)
      tokens.push({
        type: 'text',
        text: match[3],
        marks: [{ type: 'link', attrs: { href: match[4], target: '_blank', rel: 'noopener noreferrer' } }],
      });
    } else if (match[5] !== undefined) {
      // Inline code
      tokens.push({ type: 'text', text: match[5], marks: [{ type: 'code' }] });
    } else if (match[6] !== undefined || match[7] !== undefined) {
      // Bold
      tokens.push({ type: 'text', text: match[6] || match[7], marks: [{ type: 'bold' }] });
    } else if (match[8] !== undefined || match[9] !== undefined) {
      // Italic
      tokens.push({ type: 'text', text: match[8] || match[9], marks: [{ type: 'italic' }] });
    } else if (match[10] !== undefined) {
      // Strikethrough
      tokens.push({ type: 'text', text: match[10], marks: [{ type: 'strike' }] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text: text || '' }];
}
