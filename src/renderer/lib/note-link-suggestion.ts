import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { NoteLinkSuggestionMenu } from '../components/NoteLinkSuggestionMenu';

export interface NoteLinkItem {
  id: string;
  title: string;
}

export interface NoteLinkSuggestionOptions {
  suggestion: Omit<SuggestionOptions<NoteLinkItem>, 'editor'>;
}

export const NoteLinkSuggestionExtension = Extension.create<NoteLinkSuggestionOptions>({
  name: 'noteLinkSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        allowSpaces: true,
        command: ({ editor, range, props }: any) => {
          const noteItem = props as NoteLinkItem;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'text',
                marks: [
                  {
                    type: 'noteLink',
                    attrs: {
                      noteId: noteItem.id,
                      noteTitle: noteItem.title,
                    },
                  },
                ],
                text: noteItem.title,
              },
            ])
            .run();
        },
        items: () => [],
        render: () => {
          let component: ReactRenderer | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(NoteLinkSuggestionMenu, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },

            onUpdate(props: any) {
              component?.updateProps(props);

              if (!props.clientRect) return;

              popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect,
              });
            },

            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
              }
              return (component?.ref as any)?.onKeyDown(props);
            },

            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
