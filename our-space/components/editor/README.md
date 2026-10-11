# Rich Text Editor — Phase 1 integration gate

Current status: **development branch only; not yet production ready.**

## Install dependencies (in `our-space/`)

Run with network access:

```sh
npm install @tiptap/react@^3 @tiptap/core@^3 @tiptap/starter-kit@^3 @tiptap/extension-underline@^3 @tiptap/extension-text-style@^3 @tiptap/extension-highlight@^3 @tiptap/extension-task-list@^3 @tiptap/extension-task-item@^3
npm run build
```

Commit both `package.json` and `package-lock.json` together. Check extension exports against the installed Tiptap 3 version and adjust if necessary.

## Required checks before connecting QuickNotes.tsx

1. Run the non-destructive SQL migration `supabase/quick_notes_rich_text_v1.sql` in Supabase.
2. Verify old Markdown notes render unmodified, including checkboxes, links, colors and highlights.
3. Verify selection-only small/normal/large, bold, italic, underline, color, highlight, task completion, undo/redo.
4. Implement dual-write: `content_json` stores editor JSON; `content` stores backwards-compatible text for unmigrated clients.
5. Ensure saving an old note never discards unsupported legacy tokens.
6. Implement a shared read-only viewer for JSON, fall back to `QuickNoteMarkdown` where JSON is missing.
7. Verify Quick Notes expanded modal, inline editor, and composer; especially discard confirmation and database errors.
8. Only then swap Web Quick Notes. Keep Mini Focus unchanged until Web sign-off.

The staged `RichTextEditor.tsx` deliberately is **not imported by production pages** yet. A Tiptap 3 build check is required before enabling it.
