import type { JSONContent } from '@tiptap/react';
import type { Note } from '../types';

function extractText(content: JSONContent): string {
  let text = '';
  if (content.text) text += content.text;
  if (content.content) {
    for (const child of content.content) {
      text += extractText(child) + '\n';
    }
  }
  return text;
}

export function exportToPlainText(note: Note): string {
  let result = note.title + '\n\n';
  result += extractText(note.content);
  return result.trim();
}

export function exportToHTML(note: Note, html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(note.title)}</title>
</head>
<body>
  <h1>${escapeHtml(note.title)}</h1>
  ${html}
</body>
</html>`;
}

export function exportToMarkdown(note: Note): string {
  let md = `# ${note.title}\n\n`;
  md += jsonToMarkdown(note.content);
  return md.trim();
}

export function exportToJSON(note: Note): string {
  return JSON.stringify(note, null, 2);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonToMarkdown(node: JSONContent, indent = ''): string {
  if (!node) return '';
  let result = '';
  switch (node.type) {
    case 'doc':
      if (node.content) result += node.content.map((child) => jsonToMarkdown(child, indent)).join('');
      break;
    case 'paragraph':
      result += indent + inlineToMarkdown(node) + '\n\n';
      break;
    case 'heading': {
      const level = node.attrs?.level || 1;
      result += '#'.repeat(level) + ' ' + inlineToMarkdown(node) + '\n\n';
      break;
    }
    case 'bulletList':
      if (node.content) result += node.content.map((item) => jsonToMarkdown(item, indent)).join('');
      result += '\n';
      break;
    case 'orderedList':
      if (node.content) node.content.forEach((item, i) => { result += `${indent}${i + 1}. ${inlineToMarkdown(item)}\n`; });
      result += '\n';
      break;
    case 'listItem':
      result += `${indent}- ${inlineToMarkdown(node)}\n`;
      break;
    case 'taskList':
      if (node.content) result += node.content.map((item) => jsonToMarkdown(item, indent)).join('');
      result += '\n';
      break;
    case 'taskItem': {
      const checked = node.attrs?.checked ? 'x' : ' ';
      result += `${indent}- [${checked}] ${inlineToMarkdown(node)}\n`;
      break;
    }
    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      result += `\`\`\`${lang}\n${inlineToMarkdown(node)}\n\`\`\`\n\n`;
      break;
    }
    case 'blockquote':
      if (node.content) {
        const inner = node.content.map((child) => jsonToMarkdown(child, '')).join('');
        result += inner.split('\n').map((line) => `> ${line}`).join('\n') + '\n';
      }
      break;
    case 'horizontalRule':
      result += '---\n\n';
      break;
    default:
      if (node.content) result += node.content.map((child) => jsonToMarkdown(child, indent)).join('');
      break;
  }
  return result;
}

function inlineToMarkdown(node: JSONContent): string {
  if (!node.content) return node.text || '';
  return node.content.map((child) => {
    let text = child.text || '';
    if (child.content) text = inlineToMarkdown(child);
    if (child.marks) {
      for (const mark of child.marks) {
        switch (mark.type) {
          case 'bold': text = `**${text}**`; break;
          case 'italic': text = `*${text}*`; break;
          case 'code': text = `\`${text}\``; break;
          case 'strike': text = `~~${text}~~`; break;
          case 'link': text = `[${text}](${mark.attrs?.href || ''})`; break;
        }
      }
    }
    return text;
  }).join('');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
