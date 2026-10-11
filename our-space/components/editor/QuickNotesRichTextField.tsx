"use client";

import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import RichTextEditor from "@/components/editor/RichTextEditor";
import { initialRichText, richTextToLegacyMarkdown } from "@/lib/editor/richTextBridge";

type Props = {
  value: string;
  contentJson?: unknown;
  onChange: (legacy: string, json: JSONContent) => void;
  compact?: boolean;
  spacious?: boolean;
  placeholder?: string;
};

/** Controlled adapter while existing Quick Notes screens still use strings. */
export default function QuickNotesRichTextField({
  value, contentJson, onChange, compact, spacious, placeholder,
}: Props) {
  const [document, setDocument] = useState<JSONContent>(() => initialRichText(value, contentJson));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDocument(initialRichText(value, contentJson));
  }, [value, contentJson, dirty]);

  return <div className={spacious ? "mx-auto w-full max-w-[740px]" : "w-full"}>
    <RichTextEditor compact={compact} spacious={spacious} value={document} placeholder={placeholder}
      onChange={next => {
        setDirty(true);
        setDocument(next);
        onChange(richTextToLegacyMarkdown(next), next);
      }} />
  </div>;
}
