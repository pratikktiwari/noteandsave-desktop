import * as SQLite from 'expo-sqlite';
import type { Note } from '@noteandsave/workspace';
import { plainText } from './document';

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

const database = async () => {
  databasePromise ??= SQLite.openDatabaseAsync('noteandsave-search.db');
  const db = await databasePromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE VIRTUAL TABLE IF NOT EXISTS note_search
    USING fts5(id UNINDEXED, title, body, tags, tokenize = 'unicode61');
  `);
  return db;
};

const upsert = async (note: Note) => {
  const db = await database();
  await db.runAsync('DELETE FROM note_search WHERE id = ?', note.id);
  if (!note.deleted) {
    await db.runAsync(
      'INSERT INTO note_search (id, title, body, tags) VALUES (?, ?, ?, ?)',
      note.id,
      note.title,
      plainText(note.content),
      note.tags.join(' '),
    );
  }
};

export const searchIndex = {
  async rebuild(notes: Note[]) {
    const db = await database();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM note_search');
      for (const note of notes) {
        if (note.deleted) continue;
        await db.runAsync(
          'INSERT INTO note_search (id, title, body, tags) VALUES (?, ?, ?, ?)',
          note.id,
          note.title,
          plainText(note.content),
          note.tags.join(' '),
        );
      }
    });
  },

  upsert,

  async remove(id: string) {
    const db = await database();
    await db.runAsync('DELETE FROM note_search WHERE id = ?', id);
  },

  async search(query: string): Promise<string[]> {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const match = terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(' AND ');
    const db = await database();
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM note_search WHERE note_search MATCH ? ORDER BY rank LIMIT 200',
      match,
    );
    return rows.map((row) => row.id);
  },
};
