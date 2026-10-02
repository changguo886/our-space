"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import {
  Check,
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

const COMPLETION_MESSAGES = [
  "今天又向前走了一点。",
  "完成比完美更重要。",
  "辛苦啦，这件事已经做好了。",
  "一点一点，也是在前进。",
  "给今天的自己记一笔。",
  "做完了，可以休息一下。",
  "今天的努力没有白费。",
  "很好，这一件已经完成了。",
];

export default function FocusTimer({
  todo,
}: FocusTimerProps) {
  const router = useRouter();

  const [status, setStatus] =
    useState(todo.status);

  const [startedAt, setStartedAt] =
    useState<string | null>(
      todo.started_at
    );

  const [
    elapsedSeconds,
    setElapsedSeconds,
  ] = useState(
    todo.elapsed_seconds ?? 0
  );

  const [now, setNow] =
    useState(Date.now());

  const [busy, setBusy] =
    useState(false);

  /*
   * 时间到状态
   */
  const [timeUp, setTimeUp] =
    useState(false);

  /*
   * 防止提示音重复播放
   */
  const alarmPlayedRef =
    useRef(false);

  /*
   * 完成页面
   */
  const [
    showCompletion,
    setShowCompletion,
  ] = useState(false);

  const [
    finalElapsed,
    setFinalElapsed,
  ] = useState(0);

  const [
    completionMessage,
    setCompletionMessage,
  ] = useState("");

  /*
   * running 状态下每秒刷新
   */
  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status]);

  /*
   * 当前实际专注时间
   */
  const currentElapsed =
    useMemo(() => {
      if (
        status !== "running" ||
        !startedAt
      ) {
        return elapsedSeconds;
      }

      const start =
        new Date(
          startedAt
        ).getTime();

      const additional =
        Math.max(
          0,
          Math.floor(
            (now - start) / 1000
          )
        );

      return (
        elapsedSeconds +
        additional
      );
    }, [
      status,
      startedAt,
      elapsedSeconds,
      now,
    ]);

  /*
   * 目标时间
   */
  const targetSeconds =
    todo.estimated_minutes
      ? todo.estimated_minutes *
        60
      : null;

  /*
   * 剩余时间
   */
  const remainingSeconds =
    targetSeconds !== null
      ? Math.max(
          targetSeconds -
            currentElapsed,
          0
        )
      : null;

  /*
   * 圆环进度
   */
  const progress =
    targetSeconds &&
    targetSeconds > 0
      ? Math.min(
          currentElapsed /
            targetSeconds,
          1
        )
      : 0;

  /*
   * 格式化时间
   */
  function formatTime(
    seconds: number
  ) {
    const safe = Math.max(
      0,
      Math.floor(seconds)
    );

    const hours =
      Math.floor(safe / 3600);

    const minutes =
      Math.floor(
        (safe % 3600) / 60
      );

    const secs =
      safe % 60;

    if (hours > 0) {
      return [
        hours,
        minutes,
        secs,
      ]
        .map((n) =>
          String(n).padStart(
            2,
            "0"
          )
        )
        .join(":");
    }

    return `${String(
      minutes
    ).padStart(
      2,
      "0"
    )}:${String(
      secs
    ).padStart(2, "0")}`;
  }

  /*
   * 播放用户选择的提示音
   */
  function playCompleteSound() {
    const enabled =
      localStorage.getItem(
        "focus_sound_enabled"
      );

    if (enabled === "false") {
      return;
    }

    const selectedSound =
      localStorage.getItem(
        "focus_sound"
      ) ?? "chime-1";

    const audio = new Audio(
      `/sounds/${selectedSound}.mp3`
    );

    audio.volume = 0.5;

    audio.play().catch(() => {
      /*
       * 某些浏览器可能限制自动播放。
       * 不影响其他功能。
       */
    });
  }

  /*
   * 到达目标时间
   *
   * 只触发一次：
   * 1. 播放声音
   * 2. 标记 timeUp
   *
   * 不自动完成 Todo
   */
  useEffect(() => {
    if (
      status !== "running" ||
      remainingSeconds === null ||
      remainingSeconds > 0 ||
      alarmPlayedRef.current
    ) {
      return;
    }

    alarmPlayedRef.current = true;

    playCompleteSound();
    setTimeUp(true);
  }, [
    status,
    remainingSeconds,
  ]);

  /*
   * 开始 / 继续
   */
  async function startTimer() {
    if (
      busy ||
      status === "running"
    ) {
      return;
    }

    setBusy(true);

    const supabase =
      createClient();

    const start =
      new Date().toISOString();

    const { error } =
      await supabase
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

    /*
     * 如果之前时间已经到过，
     * 继续专注时不立刻重复响。
     */
    if (!timeUp) {
      alarmPlayedRef.current =
        false;
    }
  }

  /*
   * 暂停
   */
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

    const supabase =
      createClient();

    const { error } =
      await supabase
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

    setElapsedSeconds(
      newElapsed
    );

    setStartedAt(null);
    setStatus("paused");
  }

  /*
   * 时间到以后继续专注
   *
   * 不重置计时，
   * 只是让计时继续向上累计。
   */
  async function continueAfterTimeUp() {
    if (busy) return;

    setTimeUp(false);

    await startTimer();

    /*
     * 已经响过一次，
     * 继续以后不重复响。
     */
    alarmPlayedRef.current = true;
  }

  /*
   * 完成任务
   */
  async function completeTimer() {
    if (busy) return;

    setBusy(true);

    const actualElapsed =
      currentElapsed;

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .update({
          status: "completed",
          started_at: null,
          elapsed_seconds:
            actualElapsed,
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

    /*
     * 如果还没有因为时间到响过，
     * 手动完成时播放一次。
     */
    if (
      !alarmPlayedRef.current
    ) {
      playCompleteSound();

      alarmPlayedRef.current =
        true;
    }

    setElapsedSeconds(
      actualElapsed
    );

    setStartedAt(null);

    setStatus(
      "completed"
    );

    setFinalElapsed(
      actualElapsed
    );

    setTimeUp(false);

    /*
     * 随机鼓励语
     */
    const randomMessage =
      COMPLETION_MESSAGES[
        Math.floor(
          Math.random() *
            COMPLETION_MESSAGES.length
        )
      ];

    setCompletionMessage(
      randomMessage
    );

    setShowCompletion(true);
  }

  /*
   * 重置
   */
  async function resetTimer() {
    if (busy) return;

    setBusy(true);

    const supabase =
      createClient();

    const { error } =
      await supabase
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

    setTimeUp(false);

    alarmPlayedRef.current =
      false;
  }

  /*
   * 圆环
   */
  const circumference =
    2 * Math.PI * 126;

  const dashOffset =
    circumference *
    (1 - progress);

  /*
   * ==========================
   * 完成页面
   * ==========================
   */
  if (showCompletion) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sage-100 text-sage-700">
          <Check className="h-9 w-9" />
        </div>

        <p className="mt-7 text-sm text-ink-faint">
          完成啦
        </p>

        <h1 className="mt-2 max-w-lg text-2xl font-semibold">
          {todo.title}
        </h1>

        <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
          {completionMessage}
        </p>

        <div className="card mt-8 px-8 py-5">
          <p className="text-xs text-ink-faint">
            本次专注
          </p>

          <p className="mt-1 text-3xl font-semibold text-sage-700">
            {formatTime(
              finalElapsed
            )}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.replace(
                "/todo"
              );

              router.refresh();
            }}
            className="btn-primary"
          >
            返回 Todo
          </button>

          <button
            type="button"
            onClick={() => {
              router.replace(
                "/today"
              );

              router.refresh();
            }}
            className="btn-ghost"
          >
            回到今天
          </button>
        </div>
      </div>
    );
  }

  /*
   * ==========================
   * 正常 Focus 页面
   * ==========================
   */
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <p className="text-sm text-ink-faint">
        {timeUp
          ? "本轮时间到"
          : status === "running"
            ? "专注中"
            : status === "paused"
              ? "已暂停"
              : status ===
                  "completed"
                ? "已完成"
                : "准备开始"}
      </p>

      <h1 className="mt-3 max-w-lg text-center text-2xl font-semibold">
        {todo.title}
      </h1>

      {/* Timer */}
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
            {remainingSeconds !==
            null
              ? formatTime(
                  remainingSeconds
                )
              : formatTime(
                  currentElapsed
                )}
          </div>

          <p className="mt-3 text-sm text-ink-faint">
            {timeUp
              ? `已专注 ${formatTime(
                  currentElapsed
                )}`
              : targetSeconds
                ? `已专注 ${formatTime(
                    currentElapsed
                  )}`
                : "已专注时间"}
          </p>
        </div>
      </div>

      {/* 时间到 */}
      {timeUp && (
        <div className="mt-7 w-full max-w-sm rounded-2xl border border-sage-100 bg-sage-50 px-5 py-5 text-center">
          <p className="font-medium text-sage-700">
            时间到啦
          </p>

          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            可以再继续一会儿，
            也可以结束这项任务。
          </p>

          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={
                continueAfterTimeUp
              }
              disabled={busy}
              className="rounded-xl bg-sage-100 px-4 py-2.5 text-sm font-medium text-sage-700 transition hover:bg-sage-300/60"
            >
              继续专注
            </button>

            <button
              type="button"
              onClick={
                completeTimer
              }
              disabled={busy}
              className="rounded-xl bg-blush-100 px-4 py-2.5 text-sm font-medium text-blush-500 transition hover:bg-blush-50"
            >
              完成任务
            </button>
          </div>
        </div>
      )}

      {/* 普通控制按钮 */}
      {!timeUp && (
        <div className="mt-10 flex items-center gap-5">
          {status === "running" ? (
            <button
              type="button"
              onClick={
                pauseTimer
              }
              disabled={busy}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-700 shadow-soft transition hover:bg-amber-100"
              title="暂停"
            >
              <Pause className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={
                startTimer
              }
              disabled={
                busy ||
                status ===
                  "completed"
              }
              className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-sage-700 shadow-soft transition hover:bg-sage-300/70"
              title="开始 / 继续"
            >
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </button>
          )}

          <button
            type="button"
            onClick={
              completeTimer
            }
            disabled={busy}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-blush-100 text-blush-500 shadow-soft transition hover:bg-blush-50"
            title="完成任务"
          >
            <Square className="h-5 w-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={
              resetTimer
            }
            disabled={busy}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-mist-100 text-mist-500 shadow-soft transition hover:bg-mist-50"
            title="重置"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/today"
            )
          }
          className="btn-ghost text-sm"
        >
          ← 返回 Today
        </button>
      </div>
    </div>
  );
}
