"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Visual-only Mochi companion.
 * No AI calls, persistence, task writes, or database access.
 * The transparent VP9 WebM belongs at /public/companion/mochi/idle.webm.
 */
export default function MochiWidget() {
  const [open, setOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <aside
      className="pointer-events-none fixed bottom-5 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end sm:bottom-6 sm:right-6"
      aria-label="Mochi companion"
    >
      {open && (
        <section
          className="pointer-events-auto mb-1 w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-stone-200/80 bg-white/95 p-4 text-stone-800 shadow-xl backdrop-blur-sm"
          aria-label="Mochi assistant panel"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Mochi 糯米团子</p>
            <button
              type="button"
              className="rounded-lg p-1 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setOpen(false)}
              aria-label="关闭 Mochi 面板"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            你好！我已经来到 Today 页面啦。以后我会帮你查看日程、安排任务。
          </p>
          <p className="mt-2 text-xs text-stone-400">
            这是第一版互动预览，暂时没有接入 AI 或修改任务的权限。
          </p>
        </section>
      )}

      <button
        type="button"
        className="pointer-events-auto relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-transparent transition-transform duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:h-36 sm:w-36"
        aria-label={open ? "收起 Mochi 助手" : "打开 Mochi 助手"}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {videoFailed ? (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-md" aria-hidden="true">☁</span>
        ) : (
          <video
            className="h-full w-full object-contain"
            src="/companion/mochi/idle.webm"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            onError={() => setVideoFailed(true)}
          />
        )}
      </button>
    </aside>
  );
}
