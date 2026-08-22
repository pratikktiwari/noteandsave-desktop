import type { Note } from '@noteandsave/workspace';
import { plainText } from './document';

const records = new Map<string, string>();

const searchableText = (note: Note) =>
  `${note.title} ${plainText(note.content)} ${note.tags.join(' ')}`.toLocaleLowerCase();

export const searchIndex = {
  async rebuild(notes: Note[]) {
    records.clear();
    for (const note of notes) {
      if (!note.deleted) records.set(note.id, searchableText(note));
    }
  },

  async upsert(note: Note) {
    if (note.deleted) records.delete(note.id);
    else records.set(note.id, searchableText(note));
  },

  async remove(id: string) {
    records.delete(id);
  },

  async search(query: string): Promise<string[]> {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return [...records]
      .filter(([, text]) => terms.every((term) => text.includes(term)))
      .map(([id]) => id)
      .slice(0, 200);
  },
};
