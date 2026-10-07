"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createRoot,
  type Root,
} from "react-dom/client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MiniFocusWorkspace from "@/components/MiniFocusWorkspace";

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

type CompletionLevel =
  | "tiny_progress"
  | "partial"
  | "mostly_done"
  | "fully_done";

type DocumentPictureInPictureApi = {
  requestWindow: (options?: {
    width?: number;
    height?: number;
  }) => Promise<Window>;
};

type WindowWithDocumentPiP =
  Window & {
    documentPictureInPicture?:
      DocumentPictureInPictureApi;
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
   * Floating desktop window
   * ==========================
   */

  const floatingWindowRef =
    useRef<Window | null>(null);

  const floatingRootRef =
    useRef<Root | null>(null);

  const [
    floatingOpen,
    setFloatingOpen,
  ] = useState(false);

  const [
    floatingCompact,
    setFloatingCompact,
  ] = useState(false);

  const [
    floatingWorkspaceOpen,
    setFloatingWorkspaceOpen,
  ] = useState(false);

  const [
    floatingError,
    setFloatingError,
  ] =
    useState<string | null>(null);

  /*
   * 时间到
   */
  const [timeUp, setTimeUp] =
    useState(false);

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
  ] =
    useState<string | null>(null);

  /*
   * Running 时每秒刷新
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
   * 预计时间
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
   * 浮窗显示时间
   *
   * 在预计时间内：
   * 25:00 → 24:59 → ...
   *
   * 超过预计时间：
   * +00:01 → +00:02
   */
  const floatingDisplayTime =
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

  const floatingStatusText =
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

  function toggleFloatingWorkspace() {
    const pipWindow =
      floatingWindowRef.current;

    if (
      !pipWindow ||
      pipWindow.closed
    ) {
      return;
    }

    const next =
      !floatingWorkspaceOpen;

    setFloatingWorkspaceOpen(
      next
    );

    setFloatingCompact(
      false
    );

    try {
      pipWindow.resizeTo(
        next
          ? 380
          : 320,
        next
          ? 520
          : 220
      );
    } catch {
      /*
       * 某些浏览器 / 系统会限制 PiP window resize。
       * 即使 resize 失败，UI 仍会正常展开 / 收起。
       */
    }
  }

  function toggleFloatingCompact() {
    const pipWindow =
      floatingWindowRef.current;

    if (
      !pipWindow ||
      pipWindow.closed
    ) {
      return;
    }

    const next =
      !floatingCompact;

    setFloatingCompact(next);

    try {
      if (next) {
        pipWindow.resizeTo(
          120,
          150
        );
      } else {
        pipWindow.resizeTo(
          floatingWorkspaceOpen
            ? 380
            : 320,
          floatingWorkspaceOpen
            ? 520
            : 220
        );
      }
    } catch {
      /*
       * 某些浏览器 / 系统可能限制 PiP 窗口尺寸。
       * 即使 resize 失败，UI 仍然会切换 compact 模式。
       */
    }
  }

  /*
   * 关闭桌面悬浮窗
   *
   * 注意：
   * 这里只关窗口。
   * 不会暂停 / 完成任务。
   */
  function closeFloatingTimer() {
    const pipWindow =
      floatingWindowRef.current;

    floatingWindowRef.current =
      null;

    floatingRootRef.current =
      null;

    setFloatingOpen(false);
    setFloatingCompact(false);
    setFloatingWorkspaceOpen(false);

    if (
      pipWindow &&
      !pipWindow.closed
    ) {
      pipWindow.close();
    }
  }

  /*
   * 打开真正的桌面悬浮窗
   *
   * Document Picture-in-Picture
   * 会由 Chrome / Windows
   * 创建一个独立的 always-on-top 窗口。
   */
  async function openFloatingTimer() {
    setFloatingError(null);

    const existing =
      floatingWindowRef.current;

    if (
      existing &&
      !existing.closed
    ) {
      existing.focus();
      return;
    }

    const browserWindow =
      window as WindowWithDocumentPiP;

    const api =
      browserWindow
        .documentPictureInPicture;

    if (!api) {
      setFloatingError(
        "当前浏览器不支持桌面悬浮计时窗，请使用最新版 Chrome。"
      );

      return;
    }

    try {
      const pipWindow =
        await api.requestWindow({
          width: 320,
          height: 220,
        });

      pipWindow.document.title =
        `Focus · ${todo.title}`;

      /*
       * 清空默认内容
       */
      pipWindow.document.head.innerHTML =
        "";

      pipWindow.document.body.innerHTML =
        "";

      /*
       * 设置基础页面样式
       */
      pipWindow.document.documentElement.style.background =
        "#FBF7F1";

      pipWindow.document.body.style.margin =
        "0";

      pipWindow.document.body.style.padding =
        "0";

      pipWindow.document.body.style.background =
        "#FBF7F1";

      pipWindow.document.body.style.overflow =
        "hidden";

      pipWindow.document.body.style.fontFamily =
        `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

      /*
       * React Root
       */
      const container =
        pipWindow.document.createElement(
          "div"
        );

      container.style.width =
        "100%";

      container.style.height =
        "100vh";

      pipWindow.document.body.appendChild(
        container
      );

      const root =
        createRoot(container);

      floatingWindowRef.current =
        pipWindow;

      floatingRootRef.current =
        root;

      setFloatingCompact(false);
      setFloatingOpen(true);

      /*
       * 用户点系统 X 关闭时，
       * 不结束计时。
       */
      pipWindow.addEventListener(
        "pagehide",
        () => {
          floatingWindowRef.current =
            null;

          floatingRootRef.current =
            null;

          setFloatingOpen(false);
        },
        {
          once: true,
        }
      );
    } catch (error) {
      console.error(
        "Failed to open floating timer:",
        error
      );

      setFloatingError(
        "没有成功打开悬浮窗，可以再点一次「打开悬浮窗」。"
      );
    }
  }

  /*
   * 播放结束提示音
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
       * 自动播放被浏览器限制时，
       * 不影响其他功能。
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
   *
   * openFloating = true:
   * 主页面按钮使用。
   *
   * openFloating = false:
   * 浮窗内部的 Continue 使用，
   * 避免再次打开一个浮窗。
   */
  async function startTimer(
    openFloating = true
  ) {
    if (
      busy ||
      status === "running"
    ) {
      return;
    }

    /*
     * 非常重要：
     *
     * requestWindow 必须尽量直接发生在
     * 用户点击操作之后。
     *
     * 所以一定放在 Supabase await 之前。
     */
    if (openFloating) {
      void openFloatingTimer();
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
   * 时间到了以后继续
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
    if (busy) {
      return;
    }

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
     * 完成任务后自动关闭浮窗。
     */
    closeFloatingTimer();

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
   * 保存完成度
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
    if (busy) {
      return;
    }

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

    closeFloatingTimer();
  }

  /*
   * ==========================
   * 更新 Floating Window UI
   * ==========================
   *
   * 主页面每秒更新 state，
   * 然后这里重新 render 浮窗。
   */
  useEffect(() => {
    if (
      !floatingOpen ||
      !floatingRootRef.current ||
      !floatingWindowRef.current ||
      floatingWindowRef.current.closed
    ) {
      return;
    }

    const root =
      floatingRootRef.current;

    const buttonBase: React.CSSProperties =
      {
        border: "none",
        cursor: busy
          ? "default"
          : "pointer",
        transition:
          "transform 120ms ease, opacity 120ms ease",
      };

   root.render(
  floatingCompact ? (
    /*
     * ==========================
     * Side Compact Mode
     * ==========================
     */
    <div
      style={{
        boxSizing:
          "border-box",

        width:
          "100%",

        height:
          "100vh",

        padding:
          "10px 8px",

        display:
          "flex",

        flexDirection:
          "column",

        alignItems:
          "center",

        justifyContent:
          "space-between",

        background:
          "#FFFDFA",

        color:
          "#353934",

        userSelect:
          "none",
      }}
    >
      {/*
       * 展开
       */}
      <button
        type="button"
        onClick={
          toggleFloatingCompact
        }
        title="展开悬浮窗"
        style={{
          ...buttonBase,

          width:
            "28px",

          height:
            "24px",

          borderRadius:
            "9px",

          background:
            "transparent",

          color:
            "#8B9188",

          fontSize:
            "15px",

          opacity:
            busy
              ? 0.5
              : 1,
        }}
      >
        ↗
      </button>

      {/*
       * 时间
       */}
      <div
        style={{
          textAlign:
            "center",

          fontSize:
            "21px",

          lineHeight:
            1,

          fontWeight:
            600,

          fontVariantNumeric:
            "tabular-nums",

          letterSpacing:
            "-0.8px",

          color:
            "#353934",
        }}
      >
        {
          floatingDisplayTime
        }
      </div>

      {/*
       * 状态
       */}
      <div
        style={{
          maxWidth:
            "100%",

          overflow:
            "hidden",

          textOverflow:
            "ellipsis",

          whiteSpace:
            "nowrap",

          fontSize:
            "9px",

          color:
            timeUp
              ? "#A66D67"
              : "#999D96",
        }}
      >
        {
          floatingStatusText
        }
      </div>

      {/*
       * Compact 模式只保留暂停 / 继续
       */}
      {status ===
      "running" ? (
        <button
          type="button"
          disabled={busy}
          onClick={
            pauseTimer
          }
          title="暂停"
          style={{
            ...buttonBase,

            width:
              "34px",

            height:
              "34px",

            borderRadius:
              "999px",

            background:
              "#E9F1E7",

            color:
              "#597356",

            fontSize:
              "14px",

            fontWeight:
              700,

            opacity:
              busy
                ? 0.5
                : 1,
          }}
        >
          Ⅱ
        </button>
      ) : (
        <button
          type="button"
          disabled={
            busy ||
            status ===
              "completed"
          }
          onClick={() =>
            startTimer(false)
          }
          title="继续"
          style={{
            ...buttonBase,

            width:
              "34px",

            height:
              "34px",

            borderRadius:
              "999px",

            background:
              "#E9F1E7",

            color:
              "#597356",

            fontSize:
              "14px",

            opacity:
              busy
                ? 0.5
                : 1,
          }}
        >
          ▶
        </button>
      )}
    </div>
  ) : (
    /*
     * ==========================
     * Normal Floating Mode
     * ==========================
     */
    <div
      style={{
        boxSizing:
          "border-box",

        width:
          "100%",

        height:
          "100vh",

        padding:
          "14px 16px 15px",

        display:
          "flex",

        flexDirection:
          "column",

        background:
          "#FFFDFA",

        color:
          "#353934",

        userSelect:
          "none",
      }}
    >
      {/*
       * Header
       */}
      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          gap:
            "8px",

          minHeight:
            "22px",
        }}
      >
        <div
          title={
            todo.title
          }
          style={{
            minWidth:
              0,

            flex:
              1,

            overflow:
              "hidden",

            textOverflow:
              "ellipsis",

            whiteSpace:
              "nowrap",

            fontSize:
              "12px",

            fontWeight:
              500,

            color:
              "#73786F",
          }}
        >
          {todo.title}
        </div>

        {/*
         * 打开 / 收起 Steps & Notes 工作区。
         * 默认仍保持轻量计时窗，不长期展开完整 Notes。
         */}
        <button
          type="button"
          onClick={
            toggleFloatingWorkspace
          }
          title={
            floatingWorkspaceOpen
              ? "收起 Steps & Notes"
              : "打开 Steps & Notes"
          }
          style={{
            ...buttonBase,

            height:
              "25px",

            padding:
              "0 8px",

            borderRadius:
              "999px",

            background:
              floatingWorkspaceOpen
                ? "#E9F1E7"
                : "transparent",

            color:
              floatingWorkspaceOpen
                ? "#597356"
                : "#999D96",

            fontSize:
              "9px",

            fontWeight:
              600,
          }}
        >
          {
            floatingWorkspaceOpen
              ? "Hide"
              : "Steps + Notes"
          }
        </button>

        {/*
         * 收到侧边
         */}
        <button
          type="button"
          onClick={
            toggleFloatingCompact
          }
          title="收起到侧边"
          style={{
            ...buttonBase,

            width:
              "25px",

            height:
              "25px",

            borderRadius:
              "999px",

            background:
              "transparent",

            color:
              "#999D96",

            fontSize:
              "14px",
          }}
        >
          ◀
        </button>

        {/*
         * 关闭
         */}
        <button
          type="button"
          onClick={
            closeFloatingTimer
          }
          title="关闭悬浮窗"
          style={{
            ...buttonBase,

            width:
              "25px",

            height:
              "25px",

            borderRadius:
              "999px",

            background:
              "transparent",

            color:
              "#999D96",

            fontSize:
              "17px",

            lineHeight:
              1,
          }}
        >
          ×
        </button>
      </div>

      {/*
       * Time
       */}
      <div
        style={{
          marginTop:
            "9px",

          textAlign:
            "center",

          fontSize:
            "36px",

          lineHeight:
            1,

          letterSpacing:
            "-1.6px",

          fontWeight:
            550,

          fontVariantNumeric:
            "tabular-nums",

          color:
            "#333831",
        }}
      >
        {
          floatingDisplayTime
        }
      </div>

      {/*
       * Progress
       */}
      <div
        style={{
          marginTop:
            "14px",

          width:
            "100%",

          height:
            "5px",

          overflow:
            "hidden",

          borderRadius:
            "999px",

          background:
            "#ECEAE5",
        }}
      >
        <div
          style={{
            width:
              targetSeconds
                ? `${Math.round(
                    progress *
                      100
                  )}%`
                : "0%",

            height:
              "100%",

            borderRadius:
              "999px",

            background:
              "#93AC8A",

            transition:
              "width 700ms ease",
          }}
        />
      </div>

      {/*
       * Status
       */}
      <div
        style={{
          marginTop:
            "7px",

          display:
            "flex",

          justifyContent:
            "space-between",

          fontSize:
            "10px",

          color:
            "#999D96",
        }}
      >
        <span>
          {
            floatingStatusText
          }
        </span>

        <span>
          已专注{" "}
          {formatTime(
            currentElapsed
          )}
        </span>
      </div>

      {floatingWorkspaceOpen && (
        <div
          style={{
            marginTop:
              "10px",

            minHeight:
              0,

            flex:
              1,

            display:
              "flex",
          }}
        >
          <MiniFocusWorkspace
            todoId={
              todo.id
            }
          />
        </div>
      )}

      {/*
       * Controls
       */}
      <div
        style={{
          marginTop:
            floatingWorkspaceOpen
              ? "10px"
              : "auto",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          gap:
            "12px",
        }}
      >
        {timeUp ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={
                continueAfterTimeUp
              }
              style={{
                ...buttonBase,

                minWidth:
                  "98px",

                height:
                  "34px",

                borderRadius:
                  "12px",

                background:
                  "#E9F1E7",

                color:
                  "#597356",

                fontSize:
                  "11px",

                fontWeight:
                  600,
              }}
            >
              继续专注
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={
                completeTimer
              }
              style={{
                ...buttonBase,

                minWidth:
                  "78px",

                height:
                  "34px",

                borderRadius:
                  "12px",

                background:
                  "#F5E8E5",

                color:
                  "#A66D67",

                fontSize:
                  "11px",

                fontWeight:
                  600,
              }}
            >
              完成
            </button>
          </>
        ) : (
          <>
            {status ===
            "running" ? (
              <button
                type="button"
                disabled={busy}
                onClick={
                  pauseTimer
                }
                title="暂停"
                style={{
                  ...buttonBase,

                  width:
                    "36px",

                  height:
                    "36px",

                  borderRadius:
                    "999px",

                  background:
                    "#E9F1E7",

                  color:
                    "#597356",

                  fontSize:
                    "15px",

                  fontWeight:
                    700,
                }}
              >
                Ⅱ
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  busy ||
                  status ===
                    "completed"
                }
                onClick={() =>
                  startTimer(
                    false
                  )
                }
                title="继续"
                style={{
                  ...buttonBase,

                  width:
                    "36px",

                  height:
                    "36px",

                  borderRadius:
                    "999px",

                  background:
                    "#E9F1E7",

                  color:
                    "#597356",

                  fontSize:
                    "15px",
                }}
              >
                ▶
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={
                completeTimer
              }
              title="完成任务"
              style={{
                ...buttonBase,

                width:
                  "36px",

                height:
                  "36px",

                borderRadius:
                  "999px",

                background:
                  "#F5E8E5",

                color:
                  "#A66D67",

                fontSize:
                  "16px",

                fontWeight:
                  700,
              }}
            >
              ✓
            </button>
          </>
        )}
      </div>
    </div>
  )
);

  }, [
    floatingOpen,
    floatingCompact,
    floatingDisplayTime,
    floatingStatusText,
    currentElapsed,
    progress,
    status,
    timeUp,
    busy,
    targetSeconds,
    floatingWorkspaceOpen,
  ]);

  /*
   * 页面离开时关闭桌面悬浮窗
   */
  useEffect(() => {
    return () => {
      const pipWindow =
        floatingWindowRef.current;

      floatingWindowRef.current =
        null;

      floatingRootRef.current =
        null;

      if (
        pipWindow &&
        !pipWindow.closed
      ) {
        pipWindow.close();
      }
    };
  }, []);

  /*
   * 主页面圆环
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
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
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
       * Main Timer
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
              onClick={() =>
                startTimer(true)
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

      {/*
       * Floating window control
       *
       * 正常开始时自动打开。
       * 如果用户自己 × 掉，
       * 可以在这里重新打开。
       */}
      {status !==
        "completed" && (
        <div className="mt-6 text-center">
          {!floatingOpen && (
            <button
              type="button"
              onClick={() => {
                void openFloatingTimer();
              }}
              className="text-xs text-ink-faint underline decoration-line underline-offset-4 transition hover:text-sage-700"
            >
              打开 Mini Focus Companion
            </button>
          )}

          {floatingOpen && (
            <p className="text-xs text-sage-700">
              Mini Focus Companion 已开启
            </p>
          )}

          {floatingError && (
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-blush-500">
              {
                floatingError
              }
            </p>
          )}
        </div>
      )}

      <div className="mt-7">
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
