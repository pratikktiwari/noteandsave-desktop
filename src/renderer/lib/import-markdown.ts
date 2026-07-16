import type { JSONContent } from '@tiptap/react';

/**
 * Converts a markdown string into TipTap-compatible JSONContent.
 * Supports headings, bold, italic, strikethrough, code, links,
 * bullet/ordered/task lists, code blocks, blockquotes, horizontal rules,
 * images, and tables.
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

    // Table: detect a line that looks like a table row followed by a separator
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableNode = parseTable(lines, i);
      doc.content!.push(tableNode.node);
      i = tableNode.nextIndex;
      continue;
    }

    // Blockquote (handles `>`, `> text`, and nested `>>`)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        // Strip one level of `> ` or `>`
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
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

// --- Table parsing ---

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function parseTableCells(line: string): string[] {
  // Split by | but ignore the first and last empty entries
  const parts = line.trim().split('|');
  // Remove first and last (empty from leading/trailing |)
  return parts.slice(1, -1).map((cell) => cell.trim());
}

function parseTable(lines: string[], startIndex: number): { node: JSONContent; nextIndex: number } {
  let i = startIndex;

  // Header row
  const headerCells = parseTableCells(lines[i]);
  i++; // skip header

  // Separator row
  i++; // skip separator

  // Body rows
  const bodyRows: string[][] = [];
  while (i < lines.length && isTableRow(lines[i])) {
    bodyRows.push(parseTableCells(lines[i]));
    i++;
  }

  const colCount = headerCells.length;

  // Build header row
  const headerRowNode: JSONContent = {
    type: 'tableRow',
    content: headerCells.map((cell) => ({
      type: 'tableHeader',
      content: [{ type: 'paragraph', content: parseInline(cell) }],
    })),
  };

  // Build body rows
  const bodyRowNodes: JSONContent[] = bodyRows.map((row) => ({
    type: 'tableRow',
    content: Array.from({ length: colCount }, (_, idx) => ({
      type: 'tableCell',
      content: [{ type: 'paragraph', content: parseInline(row[idx] || '') }],
    })),
  }));

  return {
    node: {
      type: 'table',
      content: [headerRowNode, ...bodyRowNodes],
    },
    nextIndex: i,
  };
}

// --- Inline parsing ---

function parseInline(text: string): JSONContent[] {
  const tokens: JSONContent[] = [];
  if (!text) return tokens;

  // Process inline patterns using a recursive approach for nested marks
  const result = parseInlineRecursive(text, []);
  return result.length > 0 ? result : [{ type: 'text', text: text || '' }];
}

function parseInlineRecursive(text: string, outerMarks: any[]): JSONContent[] {
  const tokens: JSONContent[] = [];
  if (!text) return tokens;

  // Regex for inline patterns:
  // images ![alt](src) or ![alt](src "title")
  // links [text](url)
  // inline code `code`
  // bold ** or __
  // italic * or _
  // strikethrough ~~
  const inlineRegex = /!\[([^\]]*)\]\(([^)"]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__(?![a-zA-Z0-9])|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?![a-zA-Z0-9])|~~(.+?)~~/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add any preceding plain text
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      if (outerMarks.length > 0) {
        tokens.push({ type: 'text', text: plainText, marks: [...outerMarks] });
      } else {
        tokens.push({ type: 'text', text: plainText });
      }
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // Image: ![alt](src) or ![alt](src "title")
      const src = match[2].trim();
      const marks = [...outerMarks, { type: 'link', attrs: { href: src, target: '_blank', rel: 'noopener noreferrer' } }];
      tokens.push({ type: 'text', text: match[1] || 'image', marks });
    } else if (match[3] !== undefined) {
      // Link: [text](url)
      const marks = [...outerMarks, { type: 'link', attrs: { href: match[4], target: '_blank', rel: 'noopener noreferrer' } }];
      tokens.push({ type: 'text', text: match[3], marks });
    } else if (match[5] !== undefined) {
      // Inline code
      const marks = [...outerMarks, { type: 'code' }];
      tokens.push({ type: 'text', text: match[5], marks });
    } else if (match[6] !== undefined || match[7] !== undefined) {
      // Bold — recurse for nested inline marks
      const innerText = match[6] || match[7];
      const innerMarks = [...outerMarks, { type: 'bold' }];
      const innerTokens = parseInlineRecursive(innerText, innerMarks);
      tokens.push(...innerTokens);
    } else if (match[8] !== undefined || match[9] !== undefined) {
      // Italic — recurse for nested inline marks
      const innerText = match[8] || match[9];
      const innerMarks = [...outerMarks, { type: 'italic' }];
      const innerTokens = parseInlineRecursive(innerText, innerMarks);
      tokens.push(...innerTokens);
    } else if (match[10] !== undefined) {
      // Strikethrough — recurse for nested inline marks
      const innerMarks = [...outerMarks, { type: 'strike' }];
      const innerTokens = parseInlineRecursive(match[10], innerMarks);
      tokens.push(...innerTokens);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (outerMarks.length > 0) {
      tokens.push({ type: 'text', text: remaining, marks: [...outerMarks] });
    } else {
      tokens.push({ type: 'text', text: remaining });
    }
  }

  return tokens;
}
