"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";

type FocusTimerProps = {
  todo: {
    id: string;
    title: string;
    estimated_minutes: number | null;
    status: string;
    started_at: string | null;
    elapsed_seconds: number;
  };
};

export default function FocusTimer({
  todo,
}: FocusTimerProps) {
  const router = useRouter();

  const [status, setStatus] = useState(todo.status);
  const [startedAt, setStartedAt] = useState<string | null>(
    todo.started_at
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(
    todo.elapsed_seconds ?? 0
  );

  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "running") return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  const currentElapsed = useMemo(() => {
    if (
      status !== "running" ||
      !startedAt
    ) {
      return elapsedSeconds;
    }

    const start =
      new Date(startedAt).getTime();

    const additional =
      Math.max(
        0,
        Math.floor((now - start) / 1000)
      );

    return elapsedSeconds + additional;
  }, [
    status,
    startedAt,
    elapsedSeconds,
    now,
  ]);

  const targetSeconds =
    todo.estimated_minutes
      ? todo.estimated_minutes * 60
      : null;

  const remainingSeconds =
    targetSeconds !== null
      ? Math.max(
          targetSeconds - currentElapsed,
          0
        )
      : null;

  const progress =
    targetSeconds && targetSeconds > 0
      ? Math.min(
          currentElapsed / targetSeconds,
          1
        )
      : 0;

  function formatTime(seconds: number) {
    const safe = Math.max(
      0,
      Math.floor(seconds)
    );

    const hours = Math.floor(
      safe / 3600
    );

    const minutes = Math.floor(
      (safe % 3600) / 60
    );

    const secs = safe % 60;

    if (hours > 0) {
      return [
        hours,
        minutes,
        secs,
      ]
        .map((n) =>
          String(n).padStart(2, "0")
        )
        .join(":");
    }

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }

  async function startTimer() {
    if (
      busy ||
      status === "running"
    ) {
      return;
    }

    setBusy(true);

    const supabase = createClient();
    const start = new Date().toISOString();

    const { error } = await supabase
      .from("todos")
      .update({
        status: "running",
        started_at: start,
      })
      .eq("id", todo.id);

    setBusy(false);

    if (error) {
      alert(
        "开始计时失败：" +
          error.message
      );
      return;
    }

    setStartedAt(start);
    setStatus("running");
    setNow(Date.now());
  }

  async function pauseTimer() {
    if (
      busy ||
      status !== "running"
    ) {
      return;
    }

    setBusy(true);

    const newElapsed =
      currentElapsed;

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .update({
        status: "paused",
        started_at: null,
        elapsed_seconds:
          newElapsed,
      })
      .eq("id", todo.id);

    setBusy(false);

    if (error) {
      alert(
        "暂停失败：" +
          error.message
      );
      return;
    }

    setElapsedSeconds(newElapsed);
    setStartedAt(null);
    setStatus("paused");
  }

  async function completeTimer() {
    if (busy) return;

    setBusy(true);

    const finalElapsed =
      currentElapsed;

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .update({
        status: "completed",
        started_at: null,
        elapsed_seconds:
          finalElapsed,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", todo.id);

    setBusy(false);

    if (error) {
      alert(
        "完成任务失败：" +
          error.message
      );
      return;
    }

    router.replace("/today");
    router.refresh();
  }

  async function resetTimer() {
    if (busy) return;

    setBusy(true);

    const supabase = createClient();

    const { error } = await supabase
      .from("todos")
      .update({
        status: "pending",
        started_at: null,
        elapsed_seconds: 0,
        completed_at: null,
      })
      .eq("id", todo.id);

    setBusy(false);

    if (error) {
      alert(
        "重置失败：" +
          error.message
      );
      return;
    }

    setElapsedSeconds(0);
    setStartedAt(null);
    setStatus("pending");
    setNow(Date.now());
  }

  const circumference =
    2 * Math.PI * 126;

  const dashOffset =
    circumference *
    (1 - progress);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <p className="text-sm text-ink-faint">
        {status === "running"
          ? "专注中"
          : status === "paused"
          ? "已暂停"
          : "准备开始"}
      </p>

      <h1 className="mt-3 max-w-lg text-center text-2xl font-semibold">
        {todo.title}
      </h1>

      <div className="relative mt-10 flex h-72 w-72 items-center justify-center">
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 280 280"
        >
          <circle
            cx="140"
            cy="140"
            r="126"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-black/[0.06]"
          />

          {targetSeconds && (
            <circle
              cx="140"
              cy="140"
              r="126"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={
                circumference
              }
              strokeDashoffset={
                dashOffset
              }
              className="text-sage-400 transition-[stroke-dashoffset] duration-700"
            />
          )}
        </svg>

        <div className="relative text-center">
          <div className="text-5xl font-medium tracking-tight">
            {remainingSeconds !== null
              ? formatTime(
                  remainingSeconds
                )
              : formatTime(
                  currentElapsed
                )}
          </div>

          <p className="mt-3 text-sm text-ink-faint">
            {targetSeconds
              ? `已专注 ${formatTime(
                  currentElapsed
                )}`
              : "已专注时间"}
          </p>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-5">
        {status === "running" ? (
          <button
            onClick={pauseTimer}
            disabled={busy}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft"
            title="暂停"
          >
            <Pause className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={startTimer}
            disabled={
              busy ||
              status === "completed"
            }
            className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-600 text-white shadow-soft"
            title="开始"
          >
            <Play className="ml-0.5 h-5 w-5" />
          </button>
        )}

        <button
          onClick={completeTimer}
          disabled={busy}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-blush-400 text-white shadow-soft"
          title="完成"
        >
          <Square className="h-5 w-5 fill-current" />
        </button>

        <button
          onClick={resetTimer}
          disabled={busy}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft"
          title="重置"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-8">
        <button
          onClick={() =>
            router.push("/today")
          }
          className="btn-ghost text-sm"
        >
          ← 返回 Today
        </button>
      </div>
    </div>
  );
}
