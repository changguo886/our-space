"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import {
  Check,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
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

type CompletionLevel =
  | "tiny_progress"
  | "partial"
  | "mostly_done"
  | "fully_done";

type MiniPosition = {
  x: number;
  y: number;
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

const COMPLETION_LEVELS: {
  value: CompletionLevel;
  emoji: string;
  label: string;
  description: string;
}[] = [
  {
    value: "tiny_progress",
    emoji: "🌱",
    label: "小小进展",
    description: "做了一点，也很好",
  },
  {
    value: "partial",
    emoji: "🌿",
    label: "完成了一部分",
    description: "事情已经往前走了",
  },
  {
    value: "mostly_done",
    emoji: "🌸",
    label: "基本完成",
    description: "已经完成大部分啦",
  },
  {
    value: "fully_done",
    emoji: "💐",
    label: "完全完成",
    description: "圆满收尾",
  },
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
   * ==========================
   * Mini Focus
   * ==========================
   */
  const [miniMode, setMiniMode] =
    useState(false);

  const [
    miniCollapsed,
    setMiniCollapsed,
  ] = useState(false);

  const [
    miniPosition,
    setMiniPosition,
  ] =
    useState<MiniPosition | null>(
      null
    );

  const miniCardRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

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
   * 完成度反馈
   */
  const [
    completionLevel,
    setCompletionLevel,
  ] =
    useState<CompletionLevel | null>(
      null
    );

  const [
    feedbackSaving,
    setFeedbackSaving,
  ] = useState(false);

  const [
    feedbackSaved,
    setFeedbackSaved,
  ] = useState(false);

  const [
    feedbackError,
    setFeedbackError,
  ] = useState<string | null>(
    null
  );

  /*
   * 读取上次 Mini Window 的位置
   */
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          "focus_mini_position"
        );

      if (!saved) {
        return;
      }

      const parsed =
        JSON.parse(saved);

      if (
        typeof parsed?.x ===
          "number" &&
        typeof parsed?.y ===
          "number"
      ) {
        setMiniPosition({
          x: parsed.x,
          y: parsed.y,
        });
      }
    } catch {
      /*
       * 位置读取失败时，
       * 使用默认右下角位置即可。
       */
    }
  }, []);

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
   * 进度
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
   * Mini Timer 显示时间
   *
   * 到达预计时间以后，
   * 不一直停在 00:00，
   * 而显示 +00:01、+00:02...
   */
  const miniDisplayTime =
    targetSeconds !== null
      ? currentElapsed >
        targetSeconds
        ? `+${formatTime(
            currentElapsed -
              targetSeconds
          )}`
        : formatTime(
            remainingSeconds ?? 0
          )
      : formatTime(
          currentElapsed
        );

  /*
   * Mini 状态文字
   */
  const miniStatusText =
    timeUp
      ? "时间到"
      : status === "running"
        ? "专注中"
        : status === "paused"
          ? "已暂停"
          : status ===
              "completed"
            ? "已完成"
            : "准备开始";

  /*
   * Mini Window 位置限制
   *
   * 防止拖出屏幕以后找不到。
   */
  function clampMiniPosition(
    x: number,
    y: number
  ) {
    const rect =
      miniCardRef.current?.getBoundingClientRect();

    const width =
      rect?.width ??
      (miniCollapsed
        ? 230
        : 320);

    const height =
      rect?.height ??
      (miniCollapsed
        ? 64
        : 200);

    const padding = 12;

    const maxX =
      Math.max(
        padding,
        window.innerWidth -
          width -
          padding
      );

    const maxY =
      Math.max(
        padding,
        window.innerHeight -
          height -
          padding
      );

    return {
      x: Math.min(
        Math.max(
          x,
          padding
        ),
        maxX
      ),

      y: Math.min(
        Math.max(
          y,
          padding
        ),
        maxY
      ),
    };
  }

  /*
   * 开始拖动 Mini Window
   */
  function handleMiniDragStart(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const target =
      event.target as HTMLElement;

    /*
     * 点击按钮时不要触发拖动。
     */
    if (
      target.closest("button")
    ) {
      return;
    }

    const card =
      miniCardRef.current;

    if (!card) {
      return;
    }

    const rect =
      card.getBoundingClientRect();

    dragRef.current = {
      pointerId:
        event.pointerId,

      offsetX:
        event.clientX -
        rect.left,

      offsetY:
        event.clientY -
        rect.top,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  }

  /*
   * 拖动中
   */
  function handleMiniDragMove(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const drag =
      dragRef.current;

    if (
      !drag ||
      drag.pointerId !==
        event.pointerId
    ) {
      return;
    }

    const next =
      clampMiniPosition(
        event.clientX -
          drag.offsetX,

        event.clientY -
          drag.offsetY
      );

    setMiniPosition(next);
  }

  /*
   * 拖动结束
   */
  function handleMiniDragEnd(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    const drag =
      dragRef.current;

    if (
      !drag ||
      drag.pointerId !==
        event.pointerId
    ) {
      return;
    }

    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      /*
       * pointer capture 已经释放时忽略。
       */
    }

    /*
     * 保存当前 Mini Window 位置。
     */
    if (miniPosition) {
      try {
        localStorage.setItem(
          "focus_mini_position",
          JSON.stringify(
            miniPosition
          )
        );
      } catch {
        /*
         * localStorage 不可用时
         * 不影响计时。
         */
      }
    }
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
       */
    });
  }

  /*
   * 到达目标时间
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
          status:
            "running",

          started_at:
            start,
        })
        .eq(
          "id",
          todo.id
        );

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
          status:
            "paused",

          started_at:
            null,

          elapsed_seconds:
            newElapsed,
        })
        .eq(
          "id",
          todo.id
        );

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
   * 时间到了以后继续专注
   */
  function continueAfterTimeUp() {
    setTimeUp(false);

    alarmPlayedRef.current =
      true;
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
          status:
            "completed",

          started_at:
            null,

          elapsed_seconds:
            actualElapsed,

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          todo.id
        );

    setBusy(false);

    if (error) {
      alert(
        "完成任务失败：" +
          error.message
      );

      return;
    }

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
     * 完成后关闭 Mini Window。
     */
    setMiniMode(false);

    setCompletionLevel(null);
    setFeedbackSaved(false);
    setFeedbackError(null);

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
   * 保存完成度反馈
   */
  async function saveCompletionLevel(
    level: CompletionLevel
  ) {
    if (feedbackSaving) {
      return;
    }

    setCompletionLevel(level);
    setFeedbackSaving(true);
    setFeedbackSaved(false);
    setFeedbackError(null);

    const supabase =
      createClient();

    const { error } =
      await supabase
        .from("todos")
        .update({
          completion_level:
            level,
        })
        .eq(
          "id",
          todo.id
        );

    setFeedbackSaving(false);

    if (error) {
      setFeedbackError(
        "没有保存成功，再试一次？"
      );

      return;
    }

    setFeedbackSaved(true);
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
          status:
            "pending",

          started_at:
            null,

          elapsed_seconds:
            0,

          completed_at:
            null,

          completion_level:
            null,
        })
        .eq(
          "id",
          todo.id
        );

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

    setCompletionLevel(null);
    setFeedbackSaved(false);
    setFeedbackError(null);

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
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sage-100 text-sage-700">
          <Check className="h-9 w-9" />
        </div>

        <p className="mt-6 text-sm text-ink-faint">
          完成啦
        </p>

        <h1 className="mt-2 max-w-lg text-2xl font-semibold">
          {todo.title}
        </h1>

        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
          {completionMessage}
        </p>

        <div className="card mt-7 px-8 py-5">
          <p className="text-xs text-ink-faint">
            本次专注
          </p>

          <p className="mt-1 text-3xl font-semibold text-sage-700">
            {formatTime(
              finalElapsed
            )}
          </p>
        </div>

        <div className="mt-8 w-full max-w-xl">
          <div>
            <h2 className="text-base font-medium text-ink">
              这次完成得怎么样？
            </h2>

            <p className="mt-1 text-xs text-ink-faint">
              不需要打分，只是给今天留一个小小的记录。
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COMPLETION_LEVELS.map(
              (item) => {
                const selected =
                  completionLevel ===
                  item.value;

                return (
                  <button
                    key={
                      item.value
                    }
                    type="button"
                    disabled={
                      feedbackSaving
                    }
                    onClick={() =>
                      saveCompletionLevel(
                        item.value
                      )
                    }
                    className={`group flex min-h-[132px] flex-col items-center justify-center rounded-2xl border px-3 py-4 transition ${
                      selected
                        ? "border-sage-300 bg-sage-50 shadow-soft"
                        : "border-line bg-white/60 hover:-translate-y-0.5 hover:bg-white hover:shadow-soft"
                    }`}
                  >
                    <span
                      className={`text-4xl transition-transform ${
                        selected
                          ? "scale-110"
                          : "group-hover:scale-105"
                      }`}
                    >
                      {
                        item.emoji
                      }
                    </span>

                    <span className="mt-3 text-sm font-medium text-ink">
                      {
                        item.label
                      }
                    </span>

                    <span className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                      {
                        item.description
                      }
                    </span>
                  </button>
                );
              }
            )}
          </div>

          <div className="mt-4 min-h-6 text-center text-xs">
            {feedbackSaving && (
              <span className="text-ink-faint">
                保存中…
              </span>
            )}

            {!feedbackSaving &&
              feedbackSaved && (
                <span className="text-sage-700">
                  ✓ 已经记下啦
                </span>
              )}

            {!feedbackSaving &&
              feedbackError && (
                <span className="text-blush-500">
                  {
                    feedbackError
                  }
                </span>
              )}

            {!feedbackSaving &&
              !feedbackSaved &&
              !feedbackError && (
                <span className="text-ink-faint">
                  也可以跳过
                </span>
              )}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
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
    <>
      <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-4">
        {/*
         * Mini Mode 按钮
         */}
        <button
          type="button"
          onClick={() =>
            setMiniMode(true)
          }
          className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-line bg-white/70 px-3 py-2 text-xs font-medium text-ink-soft shadow-sm backdrop-blur transition hover:bg-white"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          Mini
        </button>

        <p className="text-sm text-ink-faint">
          {timeUp
            ? "本轮时间到"
            : status ===
                "running"
              ? "专注中"
              : status ===
                  "paused"
                ? "已暂停"
                : status ===
                    "completed"
                  ? "已完成"
                  : "准备开始"}
        </p>

        <h1 className="mt-3 max-w-lg text-center text-2xl font-semibold">
          {todo.title}
        </h1>

        {/*
         * Timer
         */}
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
              {targetSeconds
                ? `已专注 ${formatTime(
                    currentElapsed
                  )}`
                : "已专注时间"}
            </p>
          </div>
        </div>

        {/*
         * 时间到
         */}
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

        {/*
         * 普通控制
         */}
        {!timeUp && (
          <div className="mt-10 flex items-center gap-5">
            {status ===
            "running" ? (
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

      {/*
       * ==========================
       * Floating Mini Focus
       * ==========================
       */}
      {miniMode && (
        <div
          ref={miniCardRef}
          style={
            miniPosition
              ? {
                  left:
                    miniPosition.x,

                  top:
                    miniPosition.y,
                }
              : {
                  right: 24,
                  bottom: 24,
                }
          }
          className={`fixed z-[100] overflow-hidden border border-line bg-[#FFFDFA]/95 shadow-[0_16px_50px_rgba(45,55,45,0.18)] backdrop-blur-xl transition-[width,border-radius] duration-200 ${
            miniCollapsed
              ? "w-[230px] rounded-2xl"
              : "w-[320px] rounded-[22px]"
          }`}
        >
          {miniCollapsed ? (
            /*
             * ======================
             * 最小状态
             * ======================
             */
            <div
              className="flex h-[62px] touch-none select-none items-center gap-3 px-3.5"
              onPointerDown={
                handleMiniDragStart
              }
              onPointerMove={
                handleMiniDragMove
              }
              onPointerUp={
                handleMiniDragEnd
              }
              onPointerCancel={
                handleMiniDragEnd
              }
            >
              <button
                type="button"
                onClick={() =>
                  setMiniCollapsed(
                    false
                  )
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
                title="展开"
              >
                <Maximize2 className="h-4 w-4" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-ink-faint">
                  {todo.title}
                </p>

                <p className="font-mono text-lg font-medium tracking-tight text-ink">
                  {
                    miniDisplayTime
                  }
                </p>
              </div>

              {status ===
              "running" ? (
                <button
                  type="button"
                  onClick={
                    pauseTimer
                  }
                  disabled={busy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/70"
                  title="暂停"
                >
                  <Pause className="h-3.5 w-3.5" />
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700 transition hover:bg-sage-300/70"
                  title="继续"
                >
                  <Play className="ml-px h-3.5 w-3.5 fill-current" />
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setMiniMode(false)
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-black/[0.04] hover:text-ink"
                title="关闭 Mini"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /*
             * ======================
             * 展开状态
             * ======================
             */
            <>
              {/*
               * Header 也是拖动区域
               */}
              <div
                className="flex h-11 touch-none select-none items-center border-b border-line/70 px-4"
                onPointerDown={
                  handleMiniDragStart
                }
                onPointerMove={
                  handleMiniDragMove
                }
                onPointerUp={
                  handleMiniDragEnd
                }
                onPointerCancel={
                  handleMiniDragEnd
                }
              >
                <span className="text-xs font-medium text-ink-soft">
                  Our Days
                </span>

                <span className="ml-2 text-[10px] text-ink-faint">
                  {
                    miniStatusText
                  }
                </span>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setMiniCollapsed(
                        true
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-black/[0.04] hover:text-ink"
                    title="最小化"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMiniMode(
                        false
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-black/[0.04] hover:text-ink"
                    title="关闭 Mini"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="px-5 pb-5 pt-4">
                {/*
                 * Task
                 */}
                <p className="truncate text-center text-sm text-ink-soft">
                  {todo.title}
                </p>

                {/*
                 * Timer
                 */}
                <div className="mt-2 text-center font-mono text-[38px] font-medium leading-none tracking-[-0.04em] text-ink">
                  {
                    miniDisplayTime
                  }
                </div>

                {/*
                 * Progress
                 */}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full bg-sage-400 transition-[width] duration-700"
                    style={{
                      width:
                        targetSeconds
                          ? `${Math.round(
                              progress *
                                100
                            )}%`
                          : "0%",
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint">
                  <span>
                    {
                      miniStatusText
                    }
                  </span>

                  <span>
                    已专注{" "}
                    {formatTime(
                      currentElapsed
                    )}
                  </span>
                </div>

                {/*
                 * 时间到
                 */}
                {timeUp ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={
                        continueAfterTimeUp
                      }
                      disabled={busy}
                      className="flex-1 rounded-xl bg-sage-100 px-3 py-2.5 text-xs font-medium text-sage-700 transition hover:bg-sage-300/70"
                    >
                      继续专注
                    </button>

                    <button
                      type="button"
                      onClick={
                        completeTimer
                      }
                      disabled={busy}
                      className="flex-1 rounded-xl bg-blush-100 px-3 py-2.5 text-xs font-medium text-blush-500 transition hover:bg-blush-50"
                    >
                      完成
                    </button>
                  </div>
                ) : (
                  /*
                   * 普通 Mini 控制
                   */
                  <div className="mt-4 flex items-center justify-center gap-3">
                    {status ===
                    "running" ? (
                      <button
                        type="button"
                        onClick={
                          pauseTimer
                        }
                        disabled={
                          busy
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-sage-700 shadow-sm transition hover:bg-sage-300/70"
                        title="暂停"
                      >
                        <Pause className="h-4 w-4" />
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
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-sage-700 shadow-sm transition hover:bg-sage-300/70"
                        title="开始 / 继续"
                      >
                        <Play className="ml-px h-4 w-4 fill-current" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={
                        completeTimer
                      }
                      disabled={busy}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/70 text-ink-soft transition hover:bg-blush-50 hover:text-blush-500"
                      title="完成任务"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
