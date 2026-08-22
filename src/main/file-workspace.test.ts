import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FileWorkspace, recoverWorkspaceSwap, replaceWorkspaceDirectory } from './file-workspace';
import { parseNote, serializeNote } from './workspace-codec';
import { extractEmbeddedImages, notesMatchAfterRoundTrip } from './workspace-service';
import type { JsonValue, Note } from '../shared/workspace';

const paragraphContent = (content: JsonValue[]): JsonValue => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});

test('note Markdown preserves supported rich content and image metadata', () => {
  const note: Note = {
    id: 'note-1',
    title: 'Portable note',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' underlined', marks: [{ type: 'underline' }] },
            { type: 'text', text: ' highlighted', marks: [{ type: 'highlight' }] },
            { type: 'text', text: ' colored', marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }] },
            { type: 'text', text: ' linked note', marks: [{ type: 'noteLink', attrs: { noteId: 'note-2', noteTitle: 'Other' } }] },
            {
              type: 'image',
              attrs: {
                src: 'noteandsave-asset://image-1.png',
                alt: 'Diagram',
                title: null,
                width: 320,
                height: null,
              },
            },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [{
              type: 'tableHeader',
              attrs: { colspan: 2, rowspan: 1, colwidth: [120, 120] },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Heading' }] }],
            }],
          }],
        },
      ],
    },
    createdAt: 1,
    updatedAt: 2,
    folderId: null,
    tags: ['portable'],
    pinned: false,
    favorite: true,
    deleted: false,
    type: 'note',
  };

  const markdown = serializeNote(note);
  assert.match(markdown, /title: Portable note/);
  assert.match(markdown, /!\[Diagram\]\(\.\.\/assets\/image-1\.png/);

  const parsed = parseNote(markdown);
  const document = parsed.content as { content: Array<{ content: Array<Record<string, unknown>> }> };
  const children = document.content[0].content;
  const findText = (text: string): Record<string, unknown> =>
    children.find((child) => typeof child.text === 'string' && child.text.trim() === text) ?? {};
  assert.deepEqual(findText('bold').marks, [{ type: 'bold' }]);
  assert.deepEqual(findText('underlined').marks, [{ type: 'underline' }]);
  assert.deepEqual(findText('highlighted').marks, [{ type: 'highlight' }]);
  assert.deepEqual(findText('colored').marks, [{ type: 'textStyle', attrs: { color: '#ff0000' } }]);
  assert.deepEqual(findText('linked note').marks, [{
    type: 'noteLink',
    attrs: { noteId: 'note-2', noteTitle: 'Other' },
  }]);
  const image = children.find((child) => child.type === 'image') ?? {};
  assert.equal((image.attrs as Record<string, unknown>).src, 'noteandsave-asset://image-1.png');
  assert.equal((image.attrs as Record<string, unknown>).width, 320);
  assert.deepEqual(document.content[1], { type: 'paragraph' });
  const table = document.content[2] as unknown as {
    content: Array<{ content: Array<{ attrs: Record<string, unknown> }> }>;
  };
  assert.deepEqual(table.content[0].content[0].attrs, { colspan: 2, rowspan: 1, colwidth: [120, 120] });
});

test('file workspace supports CRUD and deterministic reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noteandsave-workspace-'));
  try {
    const workspace = new FileWorkspace(root);
    workspace.initialize('workspace-1', 1);
    workspace.createFolder({ id: 'folder-1', name: 'Work', createdAt: 2 });
    workspace.createNote({
      id: 'note-1',
      title: 'Hello',
      content: paragraphContent([{ type: 'text', text: 'world' }]),
      folderId: 'folder-1',
      createdAt: 3,
      updatedAt: 4,
    });

    workspace.createWhiteboard({ id: 'board-1', title: 'Board', document: { elements: [] } });
    workspace.saveImage({ id: 'image-1', mimeType: 'image/png', data: new Uint8Array([1, 2, 3]) });

    const reopened = new FileWorkspace(root);
    reopened.validate();
    assert.equal(reopened.listNotes().length, 1);
    assert.equal(reopened.listFolders().length, 1);
    assert.equal(reopened.listWhiteboards().length, 1);
    assert.deepEqual(reopened.getImage('image-1')?.data, new Uint8Array([1, 2, 3]));

    reopened.deleteFolder('folder-1');
    assert.equal(reopened.getNote('note-1')?.folderId, null);
    reopened.deleteNote('note-1');
    assert.equal(reopened.listNotes().length, 0);
    assert.equal(reopened.listNotes(true)[0].deleted, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported editor content fails instead of being silently removed', () => {
  const note: Note = {
    id: 'note-unsupported',
    title: 'Unsupported',
    content: { type: 'doc', content: [{ type: 'futureWidget' }] },
    createdAt: 1,
    updatedAt: 1,
    folderId: null,
    tags: [],
    pinned: false,
    favorite: false,
    deleted: false,
    type: 'note',
  };
  assert.throws(() => serializeNote(note), /Unsupported editor node/);
});

test('note Markdown preserves standalone and non-breaking boundary spaces', () => {
  const note: Note = {
    id: 'note-spaces',
    title: 'Spaces',
    content: paragraphContent([
      { type: 'text', text: 'first', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'second', marks: [{ type: 'italic' }] },
      { type: 'text', text: '\u00a0suffix' },
    ]),
    createdAt: 1,
    updatedAt: 1,
    folderId: null,
    tags: [],
    pinned: false,
    favorite: false,
    deleted: false,
    type: 'note',
  };

  assert.equal(notesMatchAfterRoundTrip(note, parseNote(serializeNote(note))), true);
});

test('note Markdown repairs invalid inline content nested directly in a list item', () => {
  const note: Note = {
    id: 'note-invalid-list',
    title: 'List repair',
    content: {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item' }] },
            { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Heading' }] },
            { type: 'text', text: '\\\\\\*\\\\\\*Test text\\\\\\*\\\\\\*' },
          ],
        }],
      }],
    },
    createdAt: 1,
    updatedAt: 1,
    folderId: null,
    tags: [],
    pinned: false,
    favorite: false,
    deleted: false,
    type: 'note',
  };

  const parsed = parseNote(serializeNote(note));
  const listItem = (parsed.content as {
    content: Array<{ content: Array<{ content: JsonValue[] }> }>;
  }).content[0].content[0];
  assert.deepEqual(listItem.content[2], {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Test text', marks: [{ type: 'bold' }] }],
  });
});

test('migration converts embedded images to portable asset references', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noteandsave-assets-'));
  try {
    const workspace = new FileWorkspace(root);
    workspace.initialize('workspace-assets', 1);
    const content = paragraphContent([{
      type: 'image',
      attrs: { src: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}` },
    }]);

    const converted = extractEmbeddedImages(content, workspace) as {
      content: Array<{ content: Array<{ attrs: { src: string } }> }>;
    };
    const source = converted.content[0].content[0].attrs.src;
    assert.match(source, /^noteandsave-asset:\/\/image-[a-f0-9]{24}\.png$/);
    const assetId = source.slice('noteandsave-asset://'.length, -'.png'.length);
    assert.deepEqual(workspace.getImage(assetId)?.data, new Uint8Array([1, 2, 3]));
    assert.equal(
      notesMatchAfterRoundTrip(
        {
          id: 'note-embedded-image',
          title: 'Embedded image',
          content: converted,
          createdAt: 1,
          updatedAt: 1,
          folderId: null,
          tags: [],
          pinned: false,
          favorite: false,
          deleted: false,
          type: 'note',
        },
        parseNote(serializeNote({
          id: 'note-embedded-image',
          title: 'Embedded image',
          content: converted,
          createdAt: 1,
          updatedAt: 1,
          folderId: null,
          tags: [],
          pinned: false,
          favorite: false,
          deleted: false,
          type: 'note',
        })),
      ),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workspace swap journal recovers an interrupted directory replacement', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'noteandsave-swap-'));
  const liveRoot = path.join(parent, 'workspace');
  const stagingRoot = path.join(parent, 'workspace.syncing');
  const backupRoot = path.join(parent, 'workspace.pre-sync-test');
  try {
    const live = new FileWorkspace(liveRoot);
    live.initialize('workspace-1', 1);
    live.createNote({ id: 'old-note', title: 'Old' });
    const staging = new FileWorkspace(stagingRoot);
    staging.initialize('workspace-1', 1);
    staging.createNote({ id: 'new-note', title: 'New' });

    fs.writeFileSync(`${liveRoot}.swap.json`, JSON.stringify({ liveRoot, stagingRoot, backupRoot }));
    fs.renameSync(liveRoot, backupRoot);
    recoverWorkspaceSwap(liveRoot);

    const recovered = new FileWorkspace(liveRoot);
    assert.equal(recovered.getNote('new-note')?.title, 'New');
    assert.equal(fs.existsSync(backupRoot), false);
    assert.equal(fs.existsSync(`${liveRoot}.swap.json`), false);

    const nextStagingRoot = path.join(parent, 'workspace.next');
    const next = new FileWorkspace(nextStagingRoot);
    next.initialize('workspace-1', 1);
    next.createNote({ id: 'final-note', title: 'Final' });
    replaceWorkspaceDirectory(liveRoot, nextStagingRoot);
    assert.equal(new FileWorkspace(liveRoot).getNote('final-note')?.title, 'Final');
    assert.equal(fs.readdirSync(parent).some((name) => name.includes('.pre-sync-')), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('migration comparison accepts harmless TipTap normalization', () => {
  const original: Note = {
    id: 'note-normalized',
    title: 'Normalized',
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Link',
          marks: [{
            type: 'link',
            attrs: {
              href: 'https://example.com',
              target: '_blank',
              rel: 'noopener noreferrer',
              class: null,
              title: null,
            },
          }],
        }],
      }, {
        type: 'paragraph',
        content: [],
      }],
    },
    createdAt: 1,
    updatedAt: 2,
    folderId: null,
    tags: [],
    pinned: false,
    favorite: false,
    deleted: false,
    type: 'note',
  };
  assert.equal(notesMatchAfterRoundTrip(original, parseNote(serializeNote(original))), true);
});
