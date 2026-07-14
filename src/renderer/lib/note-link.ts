import { Mark, mergeAttributes } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';

export interface NoteLinkOptions {
  HTMLAttributes: Record<string, any>;
  onNoteLinkClick?: (noteId: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      setNoteLink: (attributes: { noteId: string; noteTitle: string }) => ReturnType;
      unsetNoteLink: () => ReturnType;
    };
  }
}

export const NoteLink = Mark.create<NoteLinkOptions>({
  name: 'noteLink',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'ws-note-link',
      },
      onNoteLinkClick: undefined,
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-id'),
        renderHTML: (attributes) => ({
          'data-note-id': attributes.noteId,
        }),
      },
      noteTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-title'),
        renderHTML: (attributes) => ({
          'data-note-title': attributes.noteTitle,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-note-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { href: '#' }), 0];
  },

  addCommands() {
    return {
      setNoteLink:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetNoteLink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addProseMirrorPlugins() {
    const onNoteLinkClick = this.options.onNoteLinkClick;
    return [
      new Plugin({
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const link = target.closest('a[data-note-id]');
            if (link && onNoteLinkClick) {
              event.preventDefault();
              const noteId = link.getAttribute('data-note-id');
              if (noteId) {
                onNoteLinkClick(noteId);
              }
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
