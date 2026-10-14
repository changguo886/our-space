"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

export type GalleryItem = {
  id: string;
  media_type: "image" | "video";
  signed_url: string;
};

/**
 * Fixed-size thumbnails; click opens a lightbox (issue 05).
 * Thumbnails are scaled with CSS from the same signed URL — no server-side resizing.
 */
export default function MediaGallery({ media }: { media: GalleryItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = media.length;

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + count) % count)),
    [count]
  );

  useEffect(() => {
    if (open === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close, step]);

  if (count === 0) return null;
  const single = count === 1;
  const current = open === null ? null : media[open];

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(index);
            }}
            aria-label={item.media_type === "video" ? "播放视频" : "查看大图"}
            className={`relative overflow-hidden rounded-lg border border-line bg-black/[0.03] transition hover:opacity-90 ${
              single ? "h-40 w-56 max-w-full" : "h-20 w-20 md:h-24 md:w-24"
            }`}
          >
            {item.media_type === "video" ? (
              <>
                <video src={item.signed_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="h-6 w-6 fill-white text-white" />
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.signed_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>

      {current &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="查看媒体"
            onClick={close}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          >
            <button
              type="button"
              onClick={close}
              aria-label="关闭"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    step(-1);
                  }}
                  aria-label="上一张"
                  className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    step(1);
                  }}
                  aria-label="下一张"
                  className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <span className="absolute bottom-4 text-xs tabular-nums text-white/70">
                  {(open ?? 0) + 1} / {count}
                </span>
              </>
            )}
            <div onClick={(event) => event.stopPropagation()} className="max-h-full max-w-full">
              {current.media_type === "video" ? (
                <video
                  key={current.id}
                  src={current.signed_url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[85vh] max-w-[92vw] rounded-lg bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  src={current.signed_url}
                  alt=""
                  className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
