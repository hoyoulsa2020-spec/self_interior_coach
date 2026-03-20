"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import HardBreak from "@tiptap/extension-hard-break";

// Enter로 줄바꿈(<br>) 여러 번 가능하도록
const EnterHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.setHardBreak(),
      "Shift-Enter": () => this.editor.commands.setHardBreak(),
    };
  },
});

type NoticeEditorProps = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export default function NoticeEditor({ content, onChange, placeholder }: NoticeEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ hardBreak: false }),
      EnterHardBreak,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-indigo-600 underline" },
      }),
    ],
    content: content || "",
    editorProps: {
      attributes: {
        class: "min-h-[180px] sm:min-h-[280px] px-3 py-2 outline-none text-sm sm:text-base [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
      {/* 툴바 */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-sm font-medium transition ${editor.isActive("bold") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded px-2 py-1 text-sm italic transition ${editor.isActive("italic") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`rounded px-2 py-1 text-sm line-through transition ${editor.isActive("strike") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          S
        </button>
        <span className="mx-1 self-center text-gray-300">|</span>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("링크 URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className={`rounded px-2 py-1 text-sm transition ${editor.isActive("link") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          링크
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetLink().run()}
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-200"
        >
          링크 제거
        </button>
        <span className="mx-1 self-center text-gray-300">|</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`rounded px-2 py-1 text-sm transition ${editor.isActive("orderedList") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          목록
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded px-2 py-1 text-sm transition ${editor.isActive("bulletList") ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-200"}`}
        >
          •
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
