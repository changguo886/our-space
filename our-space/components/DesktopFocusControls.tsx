"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  isTauriDesktop,
  openDesktopFocusTimer,
  openDesktopFocusWorkspace,
} from "@/lib/tauri";

export default function DesktopFocusControls({
  todoId,
}: {
  todoId: string;
}) {
  const [
    available,
    setAvailable,
  ] = useState(false);

  const [
    busy,
    setBusy,
  ] = useState<
    "timer" | "workspace" | null
  >(null);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    setAvailable(
      isTauriDesktop()
    );
  }, []);

  if (!available) {
    return null;
  }

  async function open(
    kind:
      | "timer"
      | "workspace"
  ) {
    setBusy(kind);
    setError(null);

    try {
      if (kind === "timer") {
        await openDesktopFocusTimer(
          todoId
        );
      } else {
        await openDesktopFocusWorkspace(
          todoId
        );
      }
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : String(unknownError)
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mx-auto max-w-md p-4">
      <p className="text-sm font-medium text-ink">
        Desktop Focus
      </p>

      <p className="mt-1 text-xs leading-5 text-ink-faint">
        计时器和步骤 / 笔记可以作为两个独立桌面窗口打开。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={busy !== null}
          onClick={() => {
            void open("timer");
          }}
        >
          {busy === "timer"
            ? "打开中…"
            : "打开计时窗口"}
        </button>

        <button
          type="button"
          className="btn-primary text-xs"
          disabled={busy !== null}
          onClick={() => {
            void open(
              "workspace"
            );
          }}
        >
          {busy === "workspace"
            ? "打开中…"
            : "打开工作区"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-blush-500">
          {error}
        </p>
      )}
    </div>
  );
}
