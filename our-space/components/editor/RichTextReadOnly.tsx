"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
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
      StarterKit, Underline, TextStyle, Color,
      Highlight.configure({ multicolor: true }), TaskList, TaskItem, FontSize,
    ],
    content: value,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "text-xs leading-6 text-[#4A5048]" } },
  });
  if (!editor) return null;
  return <div className="quick-note-rich-reader break-words">
    <EditorContent editor={editor} />
    <style jsx global>{`
      .quick-note-rich-reader ul:not([data-type="taskList"]) { list-style: disc; padding-left: 1.5em; }
      .quick-note-rich-reader ol { list-style: decimal; padding-left: 1.5em; }
      .quick-note-rich-reader ul[data-type="taskList"] { list-style: none; padding-left: 0; }
      .quick-note-rich-reader ul[data-type="taskList"] li { display: flex; gap: 8px; }
      .quick-note-rich-reader ul[data-type="taskList"] li[data-checked="true"] > div {
        color: #9CA69B; text-decoration: line-through; text-decoration-color: #ADB6AA;
      }
    `}</style>
  </div>;
}
