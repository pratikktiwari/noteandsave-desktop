import { MarkdownManager } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  WORKSPACE_SCHEMA_VERSION,
  assertPortableId,
  type Folder,
  type FolderFile,
  type JsonValue,
  type Note,
  type Whiteboard,
  type WhiteboardFile,
  type WorkspaceManifest,
} from '../shared/workspace';

interface NoteFrontmatter {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  deleted: boolean;
  type: string;
}

const markdown = new MarkdownManager({
  extensions: [
    StarterKit,
    TaskList,
    TaskItem,
    Image.configure({ allowBase64: true }),
    Link,
    Underline,
    Highlight,
    TextStyle,
    Color,
    Table,
    TableRow,
    TableHeader,
    TableCell,
  ],
});

const IMAGE_METADATA_PREFIX = 'noteandsave:';
const COLOR_OPEN_PREFIX = '{{noteandsave-color:';
const COLOR_CLOSE = '{{/noteandsave-color}}';
const NOTE_LINK_OPEN_PREFIX = '{{noteandsave-link:';
const NOTE_LINK_CLOSE = '{{/noteandsave-link}}';
const EMPTY_PARAGRAPH_MARKER = '{{noteandsave-empty-paragraph}}';
const WHITESPACE_PARAGRAPH_PREFIX = '{{noteandsave-whitespace:';
const TABLE_CELL_PREFIX = '{{noteandsave-cell:';
const HARD_BREAK_MARKER = '{{noteandsave-hard-break}}';
const LEADING_SPACE_PREFIX = '{{noteandsave-leading:';
const TRAILING_SPACE_PREFIX = '{{noteandsave-trailing:';
const SUPPORTED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'hardBreak',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'image',
]);
const SUPPORTED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'underline',
  'highlight',
  'textStyle',
  'noteLink',
]);

const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
};

const requireNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
};

const requireSchemaVersion = (value: unknown): number => {
  const version = requireNumber(value, 'schemaVersion');
  if (version !== WORKSPACE_SCHEMA_VERSION) {
    throw new Error(`Unsupported workspace schema version ${version}`);
  }
  return version;
};

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const validateEditorContent = (value: JsonValue): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string') {
    throw new Error('Editor content contains an invalid node');
  }
  if (!SUPPORTED_NODE_TYPES.has(value.type)) {
    throw new Error(`Unsupported editor node "${value.type}" cannot be saved as Markdown`);
  }
  if (Array.isArray(value.marks)) {
    for (const mark of value.marks) {
      if (!mark || typeof mark !== 'object' || Array.isArray(mark) || typeof mark.type !== 'string') {
        throw new Error('Editor content contains an invalid mark');
      }
      if (!SUPPORTED_MARK_TYPES.has(mark.type)) {
        throw new Error(`Unsupported editor mark "${mark.type}" cannot be saved as Markdown`);
      }
    }
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) throw new Error('Editor node content must be an array');
    for (const child of value.content) validateEditorContent(child);
  }
};

const mapJson = (value: JsonValue, visitor: (node: Record<string, JsonValue>) => void): JsonValue => {
  if (Array.isArray(value)) return value.map((item) => mapJson(item, visitor));
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) next[key] = mapJson(child, visitor);
  visitor(next);
  return next;
};

const encodeTextColors = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'text' || typeof node.text !== 'string' || !Array.isArray(node.marks)) return;
    const marks = node.marks as JsonValue[];
    const colorMark = marks.find((mark) => {
      if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return false;
      const candidate = mark as Record<string, JsonValue>;
      if (candidate.type !== 'textStyle' || !candidate.attrs || typeof candidate.attrs !== 'object') return false;
      return typeof (candidate.attrs as Record<string, JsonValue>).color === 'string';
    });
    if (!colorMark || typeof colorMark !== 'object' || Array.isArray(colorMark)) return;
    const attrs = (colorMark as Record<string, JsonValue>).attrs as Record<string, JsonValue>;
    const color = attrs.color as string;
    if (!color) {
      node.marks = marks.filter((mark) => mark !== colorMark);
      return;
    }
    node.text = `${COLOR_OPEN_PREFIX}${Buffer.from(color).toString('base64url')}}}${node.text}${COLOR_CLOSE}`;
    node.marks = marks.filter((mark) => mark !== colorMark);
  });

const encodeNoteLinks = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'text' || typeof node.text !== 'string' || !Array.isArray(node.marks)) return;
    const marks = node.marks as JsonValue[];
    const noteLink = marks.find((mark) =>
      Boolean(mark && typeof mark === 'object' && !Array.isArray(mark)
        && (mark as Record<string, JsonValue>).type === 'noteLink'));
    if (!noteLink || typeof noteLink !== 'object' || Array.isArray(noteLink)) return;
    const attrs = (noteLink as Record<string, JsonValue>).attrs;
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
      throw new Error('Internal note link is missing attributes');
    }
    const noteId = (attrs as Record<string, JsonValue>).noteId;
    const noteTitle = (attrs as Record<string, JsonValue>).noteTitle;
    if (typeof noteId !== 'string' || typeof noteTitle !== 'string') {
      throw new Error('Internal note link has invalid attributes');
    }
    const encoded = Buffer.from(JSON.stringify({ noteId, noteTitle })).toString('base64url');
    node.text = `${NOTE_LINK_OPEN_PREFIX}${encoded}}}${node.text}${NOTE_LINK_CLOSE}`;
    node.marks = marks.filter((mark) => mark !== noteLink);
  });

const decodeNoteLinks = (content: JsonValue): JsonValue => {
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      const decoded = decodeNoteLinks(item);
      if (
        decoded
        && typeof decoded === 'object'
        && !Array.isArray(decoded)
        && decoded.type === 'text'
        && typeof decoded.text === 'string'
      ) {
        const pattern = /\{\{noteandsave-link:([A-Za-z0-9_-]+)\}\}([\s\S]*?)\{\{\/noteandsave-link\}\}/g;
        const nodes: JsonValue[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(decoded.text)) !== null) {
          if (match.index > lastIndex) nodes.push({ ...decoded, text: decoded.text.slice(lastIndex, match.index) });
          const attrs = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as {
            noteId: string;
            noteTitle: string;
          };
          const marks = Array.isArray(decoded.marks) ? [...decoded.marks] : [];
          marks.push({ type: 'noteLink', attrs });
          nodes.push({ ...decoded, text: match[2], marks });
          lastIndex = match.index + match[0].length;
        }
        if (nodes.length) {
          if (lastIndex < decoded.text.length) nodes.push({ ...decoded, text: decoded.text.slice(lastIndex) });
          return nodes;
        }
      }
      return [decoded];
    });
  }
  if (!content || typeof content !== 'object') return content;
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(content)) next[key] = decodeNoteLinks(child);
  return next;
};

const encodeHardBreaks = (content: JsonValue): JsonValue => {
  if (Array.isArray(content)) return content.map(encodeHardBreaks);
  if (!content || typeof content !== 'object') return content;
  if (content.type === 'hardBreak') return { type: 'text', text: HARD_BREAK_MARKER };
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(content)) next[key] = encodeHardBreaks(child);
  return next;
};

const decodeHardBreaks = (content: JsonValue): JsonValue => {
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      const decoded = decodeHardBreaks(item);
      if (
        decoded
        && typeof decoded === 'object'
        && !Array.isArray(decoded)
        && decoded.type === 'text'
        && typeof decoded.text === 'string'
        && decoded.text.includes(HARD_BREAK_MARKER)
      ) {
        const nodes: JsonValue[] = [];
        const parts = decoded.text.split(HARD_BREAK_MARKER);
        parts.forEach((part, index) => {
          if (part) nodes.push({ ...decoded, text: part });
          if (index < parts.length - 1) nodes.push({ type: 'hardBreak' });
        });
        return nodes;
      }
      return [decoded];
    });
  }
  if (!content || typeof content !== 'object') return content;
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(content)) next[key] = decodeHardBreaks(child);
  return next;
};

const encodeBoundarySpaces = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'text' || typeof node.text !== 'string') return;
    const leading = /^[ \u00a0]+/.exec(node.text)?.[0] ?? '';
    const trailing = leading.length === node.text.length
      ? ''
      : /[ \u00a0]+$/.exec(node.text)?.[0] ?? '';
    if (!leading && !trailing) return;
    const start = leading.length;
    const end = trailing.length ? node.text.length - trailing.length : node.text.length;
    const middle = node.text.slice(start, end);
    const leadingMarker = leading
      ? `${LEADING_SPACE_PREFIX}${Buffer.from(leading).toString('base64url')}}}`
      : '';
    const trailingMarker = trailing
      ? `${TRAILING_SPACE_PREFIX}${Buffer.from(trailing).toString('base64url')}}}`
      : '';
    node.text = `${leadingMarker}${middle}${trailingMarker}`;
  });

const decodeBoundarySpaces = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'text' || typeof node.text !== 'string') return;
    node.text = node.text
      .replace(/\{\{noteandsave-leading:([A-Za-z0-9_-]+)\}\}/g, (_match, encoded: string) =>
        Buffer.from(encoded, 'base64url').toString('utf8'))
      .replace(/\{\{noteandsave-trailing:([A-Za-z0-9_-]+)\}\}/g, (_match, encoded: string) =>
        Buffer.from(encoded, 'base64url').toString('utf8'));
  });

const encodeStructuralMetadata = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type === 'paragraph' && (!Array.isArray(node.content) || node.content.length === 0)) {
      node.content = [{ type: 'text', text: EMPTY_PARAGRAPH_MARKER }];
      return;
    }
    if (
      node.type === 'paragraph'
      && Array.isArray(node.content)
      && node.content.length === 1
      && node.content[0]
      && typeof node.content[0] === 'object'
      && !Array.isArray(node.content[0])
      && node.content[0].type === 'text'
      && typeof node.content[0].text === 'string'
      && !node.content[0].text.trim()
      && !node.content[0].marks
    ) {
      const encoded = Buffer.from(node.content[0].text).toString('base64url');
      node.content = [{ type: 'text', text: `${WHITESPACE_PARAGRAPH_PREFIX}${encoded}}}` }];
      return;
    }
    if (
      (node.type === 'tableCell' || node.type === 'tableHeader')
      && node.attrs
      && typeof node.attrs === 'object'
      && !Array.isArray(node.attrs)
      && Object.keys(node.attrs).length > 0
    ) {
      const marker = `${TABLE_CELL_PREFIX}${Buffer.from(JSON.stringify(node.attrs)).toString('base64url')}}}`;
      if (!Array.isArray(node.content) || node.content.length === 0) {
        node.content = [{ type: 'paragraph', content: [{ type: 'text', text: marker }] }];
        return;
      }
      const firstBlock = node.content[0];
      if (!firstBlock || typeof firstBlock !== 'object' || Array.isArray(firstBlock)) return;
      if (!Array.isArray(firstBlock.content)) firstBlock.content = [];
      const firstInline = firstBlock.content[0];
      if (
        firstInline
        && typeof firstInline === 'object'
        && !Array.isArray(firstInline)
        && firstInline.type === 'text'
        && typeof firstInline.text === 'string'
      ) {
        firstInline.text = marker + firstInline.text;
      } else {
        firstBlock.content.unshift({ type: 'text', text: marker });
      }
    }
  });

const decodeStructuralMetadata = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (
      node.type === 'paragraph'
      && Array.isArray(node.content)
      && node.content.length === 1
      && node.content[0]
      && typeof node.content[0] === 'object'
      && !Array.isArray(node.content[0])
      && node.content[0].type === 'text'
      && node.content[0].text === EMPTY_PARAGRAPH_MARKER
    ) {
      delete node.content;
      return;
    }
    if (
      node.type === 'paragraph'
      && Array.isArray(node.content)
      && node.content.length === 1
      && node.content[0]
      && typeof node.content[0] === 'object'
      && !Array.isArray(node.content[0])
      && node.content[0].type === 'text'
      && typeof node.content[0].text === 'string'
    ) {
      const match = /^\{\{noteandsave-whitespace:([A-Za-z0-9_-]*)\}\}$/.exec(node.content[0].text);
      if (match) {
        node.content = [{ type: 'text', text: Buffer.from(match[1], 'base64url').toString('utf8') }];
        return;
      }
    }
    if (
      (node.type !== 'tableCell' && node.type !== 'tableHeader')
      || !Array.isArray(node.content)
      || !node.content.length
    ) return;
    const firstBlock = node.content[0];
    if (!firstBlock || typeof firstBlock !== 'object' || Array.isArray(firstBlock) || !Array.isArray(firstBlock.content)) {
      return;
    }
    const firstInline = firstBlock.content[0];
    if (
      !firstInline
      || typeof firstInline !== 'object'
      || Array.isArray(firstInline)
      || firstInline.type !== 'text'
      || typeof firstInline.text !== 'string'
    ) return;
    const match = /^\{\{noteandsave-cell:([A-Za-z0-9_-]+)\}\}/.exec(firstInline.text);
    if (!match) return;
    node.attrs = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as JsonValue;
    firstInline.text = firstInline.text.slice(match[0].length);
    if (!firstInline.text) firstBlock.content.shift();
  });

const decodeTextColors = (content: JsonValue): JsonValue => {
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      const decoded = decodeTextColors(item);
      if (
        decoded
        && typeof decoded === 'object'
        && !Array.isArray(decoded)
        && decoded.type === 'text'
        && typeof decoded.text === 'string'
      ) {
        const pattern = /\{\{noteandsave-color:([A-Za-z0-9_-]+)\}\}([\s\S]*?)\{\{\/noteandsave-color\}\}/g;
        const nodes: JsonValue[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(decoded.text)) !== null) {
          if (match.index > lastIndex) nodes.push({ ...decoded, text: decoded.text.slice(lastIndex, match.index) });
          const color = Buffer.from(match[1], 'base64url').toString('utf8');
          const marks = Array.isArray(decoded.marks) ? [...decoded.marks] : [];
          marks.push({ type: 'textStyle', attrs: { color } });
          nodes.push({ ...decoded, text: match[2], marks });
          lastIndex = match.index + match[0].length;
        }
        if (nodes.length) {
          if (lastIndex < decoded.text.length) nodes.push({ ...decoded, text: decoded.text.slice(lastIndex) });
          return nodes;
        }
      }
      return [decoded];
    });
  }
  if (!content || typeof content !== 'object') return content;
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(content)) next[key] = decodeTextColors(child);
  return next;
};

const encodeImageAttributes = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'image' || !node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) return;
    const attrs = node.attrs as Record<string, JsonValue>;
    if (typeof attrs.src === 'string' && attrs.src.startsWith('noteandsave-asset://')) {
      attrs.src = `../assets/${attrs.src.slice('noteandsave-asset://'.length)}`;
    }
    if (attrs.width == null && attrs.height == null) return;
    const metadata = {
      title: typeof attrs.title === 'string' ? attrs.title : null,
      width: typeof attrs.width === 'number' ? attrs.width : null,
      height: typeof attrs.height === 'number' ? attrs.height : null,
    };
    attrs.title = `${IMAGE_METADATA_PREFIX}${Buffer.from(JSON.stringify(metadata)).toString('base64url')}`;
  });

const decodeImageAttributes = (content: JsonValue): JsonValue =>
  mapJson(content, (node) => {
    if (node.type !== 'image' || !node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) return;
    const attrs = node.attrs as Record<string, JsonValue>;
    if (typeof attrs.src === 'string' && attrs.src.startsWith('../assets/')) {
      attrs.src = `noteandsave-asset://${attrs.src.slice('../assets/'.length)}`;
    }
    if (typeof attrs.title !== 'string' || !attrs.title.startsWith(IMAGE_METADATA_PREFIX)) return;
    try {
      const encoded = attrs.title.slice(IMAGE_METADATA_PREFIX.length);
      const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        title: string | null;
        width: number | null;
        height: number | null;
      };
      attrs.title = metadata.title;
      attrs.width = metadata.width;
      attrs.height = metadata.height;
    } catch {
      throw new Error('Invalid Note & Save image metadata in Markdown');
    }
  });

const normalizeBlockContent = (content: JsonValue): JsonValue => {
  if (Array.isArray(content)) return content.map(normalizeBlockContent);
  if (!content || typeof content !== 'object') return content;

  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(content)) next[key] = normalizeBlockContent(child);
  if ((next.type !== 'listItem' && next.type !== 'taskItem') || !Array.isArray(next.content)) return next;

  const blocks: JsonValue[] = [];
  let inline: JsonValue[] = [];
  const flushInline = (): void => {
    if (!inline.length) return;
    blocks.push({ type: 'paragraph', content: inline });
    inline = [];
  };
  for (const child of next.content) {
    if (
      child
      && typeof child === 'object'
      && !Array.isArray(child)
      && (child.type === 'text' || child.type === 'hardBreak')
    ) {
      if (
        child.type === 'text'
        && typeof child.text === 'string'
        && !child.marks
      ) {
        const unescaped = child.text.replace(/\\+([*_])/g, '$1');
        const bold = /^\*\*([\s\S]+)\*\*$/.exec(unescaped);
        inline.push(bold
          ? { ...child, text: bold[1], marks: [{ type: 'bold' }] }
          : child);
      } else {
        inline.push(child);
      }
    } else {
      flushInline();
      blocks.push(child);
    }
  }
  flushInline();
  next.content = blocks;
  return next;
};

export const serializeNote = (note: Note): string => {
  assertPortableId(note.id, 'note.id');
  validateEditorContent(note.content);
  const frontmatter: NoteFrontmatter = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    folderId: note.folderId,
    tags: [...note.tags],
    pinned: note.pinned,
    favorite: note.favorite,
    deleted: note.deleted,
    type: note.type,
  };
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const encoded = encodeImageAttributes(
    encodeBoundarySpaces(
      encodeTextColors(encodeNoteLinks(encodeStructuralMetadata(encodeHardBreaks(note.content)))),
    ),
  );
  const body = markdown.serialize(encoded).trimEnd();
  return `---\n${yaml}\n---\n\n${body}\n`;
};

export const parseNote = (source: string): Note => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error('Note is missing YAML frontmatter');

  const raw = requireObject(parseYaml(match[1]), 'note frontmatter');
  requireSchemaVersion(raw.schemaVersion);
  const id = requireString(raw.id, 'note.id');
  assertPortableId(id, 'note.id');
  if (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== 'string')) {
    throw new Error('note.tags must be an array of strings');
  }
  if (raw.folderId !== null && typeof raw.folderId !== 'string') {
    throw new Error('note.folderId must be a string or null');
  }

  const body = match[2].trim();
  return {
    id,
    title: requireString(raw.title, 'note.title'),
    content: normalizeBlockContent(decodeBoundarySpaces(decodeHardBreaks(decodeStructuralMetadata(
      decodeNoteLinks(decodeTextColors(decodeImageAttributes(markdown.parse(body)))),
    )))) as JsonValue,
    createdAt: requireNumber(raw.createdAt, 'note.createdAt'),
    updatedAt: requireNumber(raw.updatedAt, 'note.updatedAt'),
    folderId: raw.folderId,
    tags: raw.tags as string[],
    pinned: requireBoolean(raw.pinned, 'note.pinned'),
    favorite: requireBoolean(raw.favorite, 'note.favorite'),
    deleted: requireBoolean(raw.deleted, 'note.deleted'),
    type: requireString(raw.type, 'note.type'),
  };
};

export const serializeFolder = (folder: Folder): string => {
  assertPortableId(folder.id, 'folder.id');
  return stableJson({ schemaVersion: WORKSPACE_SCHEMA_VERSION, ...folder });
};

export const parseFolder = (source: string): Folder => {
  const raw = requireObject(JSON.parse(source), 'folder');
  requireSchemaVersion(raw.schemaVersion);
  const id = requireString(raw.id, 'folder.id');
  assertPortableId(id, 'folder.id');
  if (raw.parentId !== null && typeof raw.parentId !== 'string') {
    throw new Error('folder.parentId must be a string or null');
  }
  return {
    id,
    name: requireString(raw.name, 'folder.name'),
    parentId: raw.parentId,
    createdAt: requireNumber(raw.createdAt, 'folder.createdAt'),
    order: requireNumber(raw.order, 'folder.order'),
  };
};

export const serializeWhiteboard = (whiteboard: Whiteboard): string => {
  assertPortableId(whiteboard.id, 'whiteboard.id');
  return stableJson({ schemaVersion: WORKSPACE_SCHEMA_VERSION, ...whiteboard });
};

export const parseWhiteboard = (source: string): Whiteboard => {
  const raw = requireObject(JSON.parse(source), 'whiteboard');
  requireSchemaVersion(raw.schemaVersion);
  const id = requireString(raw.id, 'whiteboard.id');
  assertPortableId(id, 'whiteboard.id');
  return {
    id,
    title: requireString(raw.title, 'whiteboard.title'),
    document: raw.document as JsonValue,
    createdAt: requireNumber(raw.createdAt, 'whiteboard.createdAt'),
    updatedAt: requireNumber(raw.updatedAt, 'whiteboard.updatedAt'),
    pinned: requireBoolean(raw.pinned, 'whiteboard.pinned'),
    favorite: requireBoolean(raw.favorite, 'whiteboard.favorite'),
    deleted: requireBoolean(raw.deleted, 'whiteboard.deleted'),
  };
};

export const serializeManifest = (manifest: WorkspaceManifest): string => {
  assertPortableId(manifest.workspaceId, 'manifest.workspaceId');
  if (manifest.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    throw new Error(`Cannot write workspace schema version ${manifest.schemaVersion}`);
  }
  return stableJson(manifest);
};

export const parseManifest = (source: string): WorkspaceManifest => {
  const raw = requireObject(JSON.parse(source), 'manifest');
  return {
    schemaVersion: requireSchemaVersion(raw.schemaVersion),
    workspaceId: requireString(raw.workspaceId, 'manifest.workspaceId'),
    createdAt: requireNumber(raw.createdAt, 'manifest.createdAt'),
  };
};

export const toFolderFile = (folder: Folder): FolderFile => ({
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  ...folder,
});

export const toWhiteboardFile = (whiteboard: Whiteboard): WhiteboardFile => ({
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  ...whiteboard,
});
