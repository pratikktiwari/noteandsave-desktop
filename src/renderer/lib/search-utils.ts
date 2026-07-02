import type { JSONContent } from '@tiptap/react';

export function extractTextFromJSON(content: JSONContent): string {
  let text = '';
  if (content.text) text += content.text;
  if (content.content) {
    for (const child of content.content) {
      text += extractTextFromJSON(child) + ' ';
    }
  }
  return text.trim();
}
