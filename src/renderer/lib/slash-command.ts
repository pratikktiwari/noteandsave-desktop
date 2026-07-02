import { Extension } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { slashCommands } from '../components/SlashCommandMenu';

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          return slashCommands.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          );
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
