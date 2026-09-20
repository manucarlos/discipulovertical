"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import type { PMNode } from "@/lib/content/tiptap";
import { PlaceholderHighlight } from "./placeholder-highlight";

interface Props {
  initialDoc: PMNode;
  onChange: (doc: PMNode) => void;
  readOnly?: boolean;
}

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Mantém o foco (e a seleção) dentro do texto ao clicar no botão.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition disabled:opacity-40 ${
        active ? "bg-brand text-white" : "text-foreground hover:bg-lilac"
      }`}
    >
      {children}
    </button>
  );
}

const IDLE_STATE = {
  h2: false,
  h3: false,
  bold: false,
  italic: false,
  bullet: false,
  ordered: false,
  quote: false,
  inTable: false,
  canUndo: false,
  canRedo: false,
};

/**
 * Editor visual do texto da lição (TipTap). Só oferece o que o formato de armazenamento representa:
 * títulos, negrito, itálico, listas, citação e tabela.
 */
export function BodyEditor({ initialDoc, onChange, readOnly = false }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // O formato da lição não tem estes recursos: desligá-los evita conteúdo que seria perdido ao salvar.
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
        link: false,
      }),
      TableKit.configure({ table: { resizable: false } }),
      PlaceholderHighlight,
    ],
    content: initialDoc,
    editable: !readOnly,
    immediatelyRender: false, // evita divergência entre servidor e navegador na primeira renderização
    editorProps: {
      attributes: {
        class: "lesson-prose",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Texto da lição",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as PMNode),
  });

  // Com immediatelyRender=false, o useEditorState só atualiza na primeira transação do editor. Por isso
  // o editor aparece assim que existe, com a barra "em repouso" (nada ativo) até o primeiro evento.
  const liveState = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            inTable: e.isActive("table"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const state = liveState ?? IDLE_STATE;

  if (!editor) {
    return <div className="min-h-64 rounded-xl border border-line bg-card p-4 text-muted">Carregando o editor…</div>;
  }
  const run = () => editor.chain().focus();

  return (
    <div className="rounded-xl border border-line bg-card">
      {!readOnly && (
        <div role="toolbar" aria-label="Formatação do texto" className="flex flex-wrap items-center gap-1 border-b border-line p-2">
          <ToolButton label="Título de seção" active={state.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}>
            Título
          </ToolButton>
          <ToolButton label="Subtítulo" active={state.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}>
            Subtítulo
          </ToolButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ToolButton label="Negrito" active={state.bold} onClick={() => run().toggleBold().run()}>
            <strong>N</strong>
          </ToolButton>
          <ToolButton label="Itálico" active={state.italic} onClick={() => run().toggleItalic().run()}>
            <em>I</em>
          </ToolButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ToolButton label="Lista com marcadores" active={state.bullet} onClick={() => run().toggleBulletList().run()}>
            • Lista
          </ToolButton>
          <ToolButton label="Lista numerada" active={state.ordered} onClick={() => run().toggleOrderedList().run()}>
            1. Lista
          </ToolButton>
          <ToolButton label="Citação" active={state.quote} onClick={() => run().toggleBlockquote().run()}>
            “ Citação
          </ToolButton>
          <ToolButton
            label="Inserir tabela"
            onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            disabled={state.inTable}
          >
            Tabela
          </ToolButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ToolButton label="Desfazer" disabled={!state.canUndo} onClick={() => run().undo().run()}>
            ↶
          </ToolButton>
          <ToolButton label="Refazer" disabled={!state.canRedo} onClick={() => run().redo().run()}>
            ↷
          </ToolButton>
        </div>
      )}

      {!readOnly && state.inTable && (
        <div role="toolbar" aria-label="Edição da tabela" className="flex flex-wrap items-center gap-1 border-b border-line bg-lilac px-2 py-1.5 text-sm">
          <span className="mr-1 text-muted">Tabela:</span>
          <ToolButton label="Adicionar linha abaixo" onClick={() => run().addRowAfter().run()}>
            + Linha
          </ToolButton>
          <ToolButton label="Remover linha" onClick={() => run().deleteRow().run()}>
            − Linha
          </ToolButton>
          <ToolButton label="Adicionar coluna à direita" onClick={() => run().addColumnAfter().run()}>
            + Coluna
          </ToolButton>
          <ToolButton label="Remover coluna" onClick={() => run().deleteColumn().run()}>
            − Coluna
          </ToolButton>
          <ToolButton label="Excluir tabela" onClick={() => run().deleteTable().run()}>
            Excluir tabela
          </ToolButton>
        </div>
      )}

      <div className="p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
