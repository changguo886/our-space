-- Phase 1: Add optional structured editor document while preserving legacy Markdown.
-- Run in Supabase SQL Editor before switching Web Quick Notes writes to JSON.
ALTER TABLE public.quick_notes
  ADD COLUMN IF NOT EXISTS content_json jsonb;

COMMENT ON COLUMN public.quick_notes.content_json IS
  'Optional Tiptap/ProseMirror document JSON; legacy content remains available for older clients.';
