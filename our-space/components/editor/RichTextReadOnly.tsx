"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Extension } from "@tiptap/core";

const FontSize = Extension.create({
  name: "storedFontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.fontSize || null,
          renderHTML: (attrs: Record<string, unknown>) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

export default function RichTextReadOnly({ value }: { value: JSONContent }) {
  const editor = useEditor({
    extensions: [
      StarterKit, TextStyle, Color,
      Highlight.configure({ multicolor: true }), TaskList, TaskItem, FontSize,
    ],
    content: value,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "ourspace-rich-reader text-xs leading-6 text-[#4A5048]" } },
  });
  if (!editor) return null;
  return <div className="quick-note-rich-reader break-words">
    <EditorContent editor={editor} />
    <style jsx global>{`
      .ourspace-rich-reader ul:not([data-type="taskList"]) { list-style: disc !important; padding-left: 1.5em !important; }
      .ourspace-rich-reader ol { list-style: decimal !important; padding-left: 1.5em !important; }
      .ourspace-rich-reader ul[data-type="taskList"] { list-style: none !important; padding-left: 0 !important; }
      .ourspace-rich-reader ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
      .ourspace-rich-reader ul[data-type="taskList"] li > label { flex: 0 0 auto; }
      .ourspace-rich-reader ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .ourspace-rich-reader ul[data-type="taskList"] li[data-checked="true"] > div {
        color: #9CA69B; text-decoration: line-through; text-decoration-color: #ADB6AA;
      }
    `}</style>
  </div>;
}
