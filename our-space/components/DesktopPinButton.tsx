"use client";

import {
  Pin,
  PinOff,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  setDesktopWindowPinned,
} from "@/lib/tauri";

export default function DesktopPinButton({
  windowLabel,
}: {
  windowLabel: string;
}) {
  const [
    pinned,
    setPinned,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  async function toggle() {
    if (busy) {
      return;
    }

    const next = !pinned;

    setBusy(true);

    try {
      const changed =
        await setDesktopWindowPinned(
          windowLabel,
          next
        );

      if (changed) {
        setPinned(next);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void toggle();
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-faint transition hover:bg-sage-50 hover:text-sage-700 disabled:opacity-50"
      title={
        pinned
          ? "取消置顶"
          : "保持置顶"
      }
      aria-label={
        pinned
          ? "取消置顶"
          : "保持置顶"
      }
    >
      {pinned ? (
        <Pin className="h-3.5 w-3.5" />
      ) : (
        <PinOff className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
