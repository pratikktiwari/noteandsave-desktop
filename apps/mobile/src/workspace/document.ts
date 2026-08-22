import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element, Text } from 'domhandler';
import type { JsonValue } from '@noteandsave/workspace';

export interface EditorMark {
  type: string;
  attrs?: Record<string, JsonValue>;
}

export interface EditorNode {
  type: string;
  attrs?: Record<string, JsonValue>;
  marks?: EditorMark[];
  text?: string;
  content?: EditorNode[];
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const markHtml = (value: string, mark: EditorMark) => {
  switch (mark.type) {
    case 'bold': return `<strong>${value}</strong>`;
    case 'italic': return `<em>${value}</em>`;
    case 'underline': return `<u>${value}</u>`;
    case 'strike': return `<s>${value}</s>`;
    case 'code': return `<code>${value}</code>`;
    case 'highlight': return `<mention indicator="highlight" text="${escapeHtml(value)}">${value}</mention>`;
    case 'link': return `<a href="${escapeHtml(String(mark.attrs?.href ?? ''))}">${value}</a>`;
    case 'noteLink':
      return `<mention indicator="noteLink" text="${escapeHtml(value)}" note-id="${escapeHtml(String(mark.attrs?.noteId ?? ''))}" note-title="${escapeHtml(String(mark.attrs?.noteTitle ?? ''))}">${value}</mention>`;
    case 'textStyle':
      return `<mention indicator="textStyle" text="${escapeHtml(value)}" color="${escapeHtml(String(mark.attrs?.color ?? ''))}">${value}</mention>`;
    default: return value;
  }
};

const nodeToHtml = (node: EditorNode): string => {
  if (node.type === 'text') {
    return (node.marks ?? []).reduce((value, mark) => markHtml(value, mark), escapeHtml(node.text ?? ''));
  }
  const children = (node.content ?? []).map(nodeToHtml).join('');
  switch (node.type) {
    case 'doc': return children;
    case 'paragraph': return `<p>${children || '<br>'}</p>`;
    case 'heading': return `<h${Number(node.attrs?.level ?? 1)}>${children}</h${Number(node.attrs?.level ?? 1)}>`;
    case 'bulletList': return `<ul>${children}</ul>`;
    case 'orderedList': return `<ol>${children}</ol>`;
    case 'listItem': return `<li>${children}</li>`;
    case 'taskList': return `<ul data-type="checkbox">${children}</ul>`;
    case 'taskItem': {
      const itemChildren = (node.content ?? [])
        .flatMap((child) => child.type === 'paragraph' ? child.content ?? [] : [child])
        .map(nodeToHtml)
        .join('');
      return `<li${node.attrs?.checked === true ? ' checked' : ''}>${itemChildren}</li>`;
    }
    case 'codeBlock': return `<pre><code>${children}</code></pre>`;
    case 'blockquote': return `<blockquote>${children}</blockquote>`;
    case 'horizontalRule': return '<hr>';
    case 'hardBreak': return '<br>';
    case 'image': {
      const src = escapeHtml(String(node.attrs?.src ?? ''));
      const alt = escapeHtml(String(node.attrs?.alt ?? ''));
      const width = Number(node.attrs?.width ?? 640);
      const height = Number(node.attrs?.height ?? 360);
      return `<img src="${src}" alt="${alt}" width="${width}" height="${height}">`;
    }
    case 'table': return `<table>${children}</table>`;
    case 'tableRow': return `<tr>${children}</tr>`;
    case 'tableHeader': return `<th>${children}</th>`;
    case 'tableCell': return `<td>${children}</td>`;
    default: return '';
  }
};

export const documentToHtml = (content: JsonValue): string => nodeToHtml(content as unknown as EditorNode);

const elementName = (node: ChildNode) => ('name' in node ? node.name.toLowerCase() : '');
const attributes = (node: ChildNode) => ('attribs' in node ? node.attribs : {});

const withMark = (nodes: EditorNode[], type: string, attrs?: Record<string, JsonValue>): EditorNode[] =>
  nodes.map((node) => {
    if (node.type === 'text') {
      const mark: EditorMark = attrs ? { type, attrs } : { type };
      return { ...node, marks: [...(node.marks ?? []), mark] };
    }
    return { ...node, content: node.content ? withMark(node.content, type, attrs) : node.content };
  });

const parseChildren = (children: ChildNode[]): EditorNode[] => children.flatMap(parseNode);

const parseNode = (node: ChildNode): EditorNode[] => {
  if (node.type === 'text') {
    const text = (node as Text).data;
    const parent = node.parent;
    const parentName = parent ? elementName(parent as ChildNode) : '';
    if (
      !text.trim()
      && (
        !parent
        || parent.type === 'root'
        || ['html', 'body', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr'].includes(parentName)
      )
    ) {
      return [];
    }
    return text ? [{ type: 'text', text }] : [];
  }
  if (node.type !== 'tag') return [];
  const element = node as Element;
  const name = elementName(element);
  const attrs = attributes(element);
  const children = parseChildren(element.children);
  if (name === 'strong' || name === 'b') return withMark(children, 'bold');
  if (name === 'em' || name === 'i') return withMark(children, 'italic');
  if (name === 'u') return withMark(children, 'underline');
  if (name === 's' || name === 'del') return withMark(children, 'strike');
  if (name === 'mark') return withMark(children, 'highlight');
  if (name === 'mention' && attrs.indicator === 'highlight') return withMark(children, 'highlight');
  if (name === 'mention' && attrs.indicator === 'noteLink') {
    return withMark(children, 'noteLink', {
      noteId: attrs['note-id'] ?? '',
      noteTitle: attrs['note-title'] ?? '',
    });
  }
  if (name === 'mention' && attrs.indicator === 'textStyle') {
    return withMark(children, 'textStyle', { color: attrs.color ?? '' });
  }
  if (name === 'a') return withMark(children, 'link', { href: attrs.href ?? '' });
  if (name === 'code' && element.parent && elementName(element.parent as ChildNode) !== 'pre') {
    return withMark(children, 'code');
  }
  if (/^h[1-6]$/.test(name)) return [{ type: 'heading', attrs: { level: Number(name[1]) }, content: children }];
  if (name === 'p' || name === 'div') return [{ type: 'paragraph', content: children }];
  if (name === 'br') return [{ type: 'hardBreak' }];
  if (name === 'hr') return [{ type: 'horizontalRule' }];
  if (name === 'blockquote') return [{ type: 'blockquote', content: children }];
  if (name === 'pre') return [{ type: 'codeBlock', content: parseChildren(element.children) }];
  if (name === 'ul') {
    const type = ['checkbox', 'checkboxList', 'taskList'].includes(attrs['data-type'])
      ? 'taskList'
      : 'bulletList';
    return [{ type, content: children }];
  }
  if (name === 'ol') return [{ type: 'orderedList', content: children }];
  if (name === 'li') {
    const parentAttrs = element.parent ? attributes(element.parent as ChildNode) : {};
    const type = (
      ['checkbox', 'checkboxList', 'taskList'].includes(parentAttrs['data-type'])
      || ['checkboxItem', 'taskItem'].includes(attrs['data-type'])
    ) ? 'taskItem' : 'listItem';
    const itemContent = children.length
      ? (children.every((child) => child.type === 'text' || child.type === 'hardBreak')
        ? [{ type: 'paragraph', content: children }]
        : children)
      : [{ type: 'paragraph' }];
    return [type === 'taskItem'
      ? {
        type,
        attrs: { checked: attrs.checked !== undefined || attrs['data-checked'] === 'true' },
        content: itemContent,
      }
      : { type, content: children }];
  }
  if (name === 'img') {
    return [{
      type: 'image',
      attrs: {
        src: attrs.src ?? '',
        alt: attrs.alt ?? '',
        title: null,
        width: Number(attrs.width) || 640,
        height: Number(attrs.height) || null,
      },
    }];
  }
  if (name === 'table') return [{ type: 'table', content: children }];
  if (name === 'tr') return [{ type: 'tableRow', content: children }];
  if (name === 'th') return [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: children }];
  if (name === 'td') return [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: children }];
  return children;
};

export const htmlToDocument = (html: string): JsonValue => {
  const parsed = parseDocument(html);
  const content = parseChildren(parsed.children).filter((node) => node.type !== 'hardBreak');
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] } as unknown as JsonValue;
};

export const plainText = (content: JsonValue): string => {
  if (Array.isArray(content)) return content.map(plainText).join(' ');
  if (!content || typeof content !== 'object') return typeof content === 'string' ? content : '';
  if (typeof content.text === 'string') return content.text;
  return Array.isArray(content.content) ? content.content.map(plainText).join(' ') : '';
};

export const createEmptyDocument = (): JsonValue => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

export const replaceImageSources = (content: JsonValue, replace: (source: string) => string): JsonValue => {
  if (Array.isArray(content)) return content.map((value) => replaceImageSources(value, replace));
  if (!content || typeof content !== 'object') return content;
  const next: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(content)) next[key] = replaceImageSources(value, replace);
  if (next.type === 'image' && next.attrs && typeof next.attrs === 'object' && !Array.isArray(next.attrs)) {
    const attrs = { ...next.attrs };
    if (typeof attrs.src === 'string') attrs.src = replace(attrs.src);
    next.attrs = attrs;
  }
  return next;
};

export const insertHighlightMarkup = (html: string, selectedText: string): string | null => {
  if (!selectedText) return null;
  const escaped = escapeHtml(selectedText);
  const index = html.indexOf(escaped);
  if (index < 0) return null;
  const replacement = `<mention indicator="highlight" text="${escapeHtml(selectedText)}">${escaped}</mention>`;
  return `${html.slice(0, index)}${replacement}${html.slice(index + escaped.length)}`;
};
