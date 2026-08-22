import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue, Note } from '@noteandsave/workspace';
import { parseNote, serializeNote } from '@noteandsave/workspace-codec';
import { toFileUri } from '../src/git/path';
import { documentToHtml, htmlToDocument, plainText } from '../src/workspace/document';

const content: JsonValue = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Mobile', marks: [{ type: 'bold' }] }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Native ' },
        { type: 'text', text: 'highlight', marks: [{ type: 'highlight' }] },
        { type: 'text', text: ' color', marks: [{ type: 'textStyle', attrs: { color: '#d97706' } }] },
        {
          type: 'text',
          text: ' note link',
          marks: [{ type: 'noteLink', attrs: { noteId: 'other-note', noteTitle: 'Other note' } }],
        },
      ],
    },
    {
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [{
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1 },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column' }] }],
        }],
      }],
    },
  ],
};

test('mobile HTML bridge preserves supported rich content', () => {
  const html = documentToHtml(content);
  const parsed = htmlToDocument(html);
  assert.match(html, /mention indicator="highlight"/);
  assert.equal(plainText(parsed).replace(/\s+/g, ' ').trim(), 'Mobile Native highlight color note link Column');
  const document = parsed as { content: Array<{ type: string }> };
  assert.deepEqual(document.content.map((node) => node.type), ['heading', 'paragraph', 'table']);
  const paragraph = parsed as unknown as {
    content: Array<{ content?: Array<{ text?: string; marks?: Array<{ type: string; attrs?: Record<string, JsonValue> }> }> }>;
  };
  const marks = paragraph.content[1].content ?? [];
  assert.deepEqual(marks.find((node) => node.text === ' color')?.marks, [
    { type: 'textStyle', attrs: { color: '#d97706' } },
  ]);
  assert.deepEqual(marks.find((node) => node.text === ' note link')?.marks, [
    { type: 'noteLink', attrs: { noteId: 'other-note', noteTitle: 'Other note' } },
  ]);
});

test('reopening mobile paragraphs does not add blank lines', () => {
  const lines: JsonValue = {
    type: 'doc',
    content: ['1', '2', '3', '4', '5'].map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };

  const reopened = Array.from({ length: 5 }).reduce<JsonValue>(
    (document) => htmlToDocument(documentToHtml(document)),
    lines,
  );

  assert.deepEqual(reopened, lines);
});

test('native HTML formatting whitespace does not become note content', () => {
  const parsed = htmlToDocument('<html>\n<p>1</p>\n<p>2</p>\n<p>3</p>\n</html>');

  assert.deepEqual(parsed, {
    type: 'doc',
    content: ['1', '2', '3'].map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  });
});

test('checklists use native checkbox HTML and remain saveable', () => {
  const checklist: JsonValue = {
    type: 'doc',
    content: [{
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
        },
      ],
    }],
  };

  const html = documentToHtml(checklist);
  const parsed = htmlToDocument('<html>\n<ul data-type="checkbox">\n<li>First</li>\n<li checked>Second</li>\n</ul>\n</html>');
  assert.equal(html, '<ul data-type="checkbox"><li>First</li><li checked>Second</li></ul>');
  assert.deepEqual(parsed, checklist);

  const note: Note = {
    id: 'checklist-note',
    title: 'Checklist',
    content: parsed,
    createdAt: 1,
    updatedAt: 2,
    folderId: null,
    tags: [],
    pinned: false,
    favorite: false,
    deleted: false,
    type: 'checklist',
  };
  assert.doesNotThrow(() => serializeNote(note));
});

test('mobile content round-trips through the shared desktop workspace codec', () => {
  const note: Note = {
    id: 'mobile-note',
    title: 'Mobile note',
    content,
    createdAt: 1,
    updatedAt: 2,
    folderId: null,
    tags: ['android'],
    pinned: true,
    favorite: false,
    deleted: false,
    type: 'note',
  };
  const parsed = parseNote(serializeNote(note));
  assert.equal(parsed.id, note.id);
  assert.equal(parsed.title, note.title);
  assert.equal(parsed.tags[0], 'android');
  assert.match(plainText(parsed.content), /Mobile/);
  assert.match(plainText(parsed.content), /Column/);
});

test('Git filesystem paths encode repository filenames safely', () => {
  assert.equal(
    toFileUri('file:///data/user/0/app/files/NoteAndSave/notes/My note #1.md'),
    'file:///data/user/0/app/files/NoteAndSave/notes/My%20note%20%231.md',
  );
  assert.equal(
    toFileUri('file:///data/user/0/app/files/NoteAndSave/notes/My%20note.md'),
    'file:///data/user/0/app/files/NoteAndSave/notes/My%20note.md',
  );
});
