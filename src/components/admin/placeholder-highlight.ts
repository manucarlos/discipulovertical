import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const MARKER = /\[PREENCHER[^\]]*\]/g;

/**
 * Destaca em amarelo, dentro do editor, cada trecho [PREENCHER: ...]. É só visual (decoração):
 * não altera o conteúdo salvo. Ajuda a achar o que ainda falta, que bloqueia a publicação.
 */
export const PlaceholderHighlight = Extension.create({
  name: "placeholderHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("placeholderHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              // O caractere reserva mantém os deslocamentos alinhados com as posições do documento.
              const text = node.textBetween(0, node.content.size, undefined, "￼");
              for (const match of text.matchAll(MARKER)) {
                const from = pos + 1 + match.index;
                decorations.push(Decoration.inline(from, from + match[0].length, { class: "placeholder-mark" }));
              }
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
