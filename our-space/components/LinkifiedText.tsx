import { Fragment } from "react";

/**
 * Plain text with http(s) URLs turned into links (issue 10).
 * Only http:// and https:// are ever linked, so javascript:, data: etc. stay plain text.
 * Safe in server and client components; the text itself is never parsed as HTML.
 */
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'，。；、）】」]+/gi;
// Punctuation that usually ends a sentence rather than the URL.
const TRAILING = /[.,;:!?)\]}]+$/;

export function splitLinks(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trail = url.match(TRAILING)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    if (start > last) parts.push({ text: text.slice(last, start) });
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") parts.push({ text: url, href: parsed.href });
      else parts.push({ text: url });
    } catch {
      parts.push({ text: url });
    }
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export default function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitLinks(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-sage-700 underline decoration-sage-300 underline-offset-2 hover:decoration-sage-700"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </span>
  );
}
