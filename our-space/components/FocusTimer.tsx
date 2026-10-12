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
import {
  PREFERENCES_BROADCAST_CHANNEL,
  PREFERENCES_UPDATED_EVENT,
  type UserPreferences,
} from "@/lib/preferences";
import MiniFocusWorkspace from "@/components/MiniFocusWorkspace";
import I18nProvider, { useI18n } from "@/components/I18nProvider";

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
  initialPreferences: UserPreferences;
  disableFloatingWindow?: boolean;
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

const COMPLETION_LEVELS: {
  value: CompletionLevel;
  emoji: string;
}[] = [
  {
    value: "tiny_progress",
    emoji: "🌱",
  },
  {
    value: "partial",
    emoji: "🌿",
  },
  {
    value: "mostly_done",
    emoji: "🌸",
  },
  {
    value: "fully_done",
    emoji: "💐",
  },
];

export default function FocusTimer({
  todo,
  initialPreferences,
  disableFloatingWindow = false,
}: FocusTimerProps) {
  const router = useRouter();
  const { dictionary } = useI18n();
  const focusText = dictionary.focus;
  const [focusEncouragement] = useState(() => {
    const phrases = [
      "慢慢来，也是在向前走。",
      "每一小段专注，都值得被珍惜。",
      "不用急着抵达，认真走好眼前这一步。",
      "今天的努力，正在悄悄积累。",
      "把注意力交给当下，剩下的交给时间。",
      "做一点，也比停在原地更接近目标。",
      "重要的不是速度，而是继续前行。",
      "让这一刻的专注，成为小小的收获。",
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  });
  const common = dictionary.common;

  const [
    preferences,
    setPreferences,
  ] = useState(
    initialPreferences
  );

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

  const [pinnedMode, setPinnedMode] = useState<"compact" | "workspace" | null>(null);
  const [preferredWorkspaceOpen, setPreferredWorkspaceOpen] = useState(false);
  const [compactFinishConfirm, setCompactFinishConfirm] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`ourspace:mini-focus:${todo.id}`);
      if (stored) {
        const saved = JSON.parse(stored) as { pinned?: boolean; workspaceOpen?: boolean; pinnedMode?: "compact" | "workspace" | null };
        const mode = saved.pinnedMode ?? (saved.pinned ? "workspace" : null);
        setPinnedMode(mode);
        setPreferredWorkspaceOpen(Boolean(mode === "workspace" || saved.workspaceOpen));
      }
    } catch { /* Preferences are optional. */ }
    setPreferencesLoaded(true);
  }, [todo.id]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(`ourspace:mini-focus:${todo.id}`, JSON.stringify({
        pinnedMode, workspaceOpen: preferredWorkspaceOpen,
      }));
    } catch { /* Browser storage may be blocked. */ }
  }, [todo.id, pinnedMode, preferredWorkspaceOpen, preferencesLoaded]);

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
   * Settings V2 preference sync.
   *
   * 同一标签页通过 CustomEvent，
   * 其它标签页通过 BroadcastChannel。
   */
  useEffect(() => {
    function handlePreferenceEvent(
      event: Event
    ) {
      const custom =
        event as CustomEvent<UserPreferences>;

      if (
        custom.detail?.user_id ===
        initialPreferences.user_id
      ) {
        setPreferences(
          custom.detail
        );
      }
    }

    window.addEventListener(
      PREFERENCES_UPDATED_EVENT,
      handlePreferenceEvent
    );

    let channel:
      BroadcastChannel | null =
        null;

    if (
      typeof BroadcastChannel !==
      "undefined"
    ) {
      channel =
        new BroadcastChannel(
          PREFERENCES_BROADCAST_CHANNEL
        );

      channel.onmessage =
        (event) => {
          const next =
            event.data as
              | UserPreferences
              | undefined;

          if (
            next?.user_id ===
            initialPreferences.user_id
          ) {
            setPreferences(
              next
            );
          }
        };
    }

    return () => {
      window.removeEventListener(
        PREFERENCES_UPDATED_EVENT,
        handlePreferenceEvent
      );

      channel?.close();
    };
  }, [
    initialPreferences.user_id,
  ]);

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
      ? focusText.status.timeUp
      : status === "running"
        ? focusText.status.focusing
        : status === "paused"
          ? focusText.status.paused
          : status ===
              "completed"
            ? focusText.status.completed
            : focusText.status.ready;

  function toggleFloatingWorkspace() {
    const pipWindow =
      floatingWindowRef.current;

    if (
      !pipWindow ||
      pipWindow.closed
    ) {
      return;
    }

    const next = !floatingWorkspaceOpen;
    setFloatingWorkspaceOpen(next);
    setPreferredWorkspaceOpen(next);

    setFloatingCompact(
      false
    );

    try {
      pipWindow.resizeTo(
        next
          ? 420
          : 320,
        next
          ? 590
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

    const next = !floatingCompact;

    setFloatingCompact(next);

    try {
      if (next) {
        pipWindow.resizeTo(
          200,
          240
        );
      } else {
        pipWindow.resizeTo(
          floatingWorkspaceOpen
            ? 420
            : 320,
          floatingWorkspaceOpen
            ? 590
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
        focusText.floatingUnsupported
      );

      return;
    }

    try {
      const pipWindow =
        await api.requestWindow({
          width: pinnedMode === "compact" ? 200 : preferredWorkspaceOpen ? 420 : 320,
          height: pinnedMode === "compact" ? 240 : preferredWorkspaceOpen ? 590 : 220,
        });

      pipWindow.document.title =
        focusText.floatingTitle.replace("{title}", todo.title);

      /*
       * 清空默认内容
       */
      // Document PiP has its own document. Copy the active app styles so
      // shared components (including the Quick Notes editor) retain their UI.
      pipWindow.document.head.replaceChildren();
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((source) => {
        pipWindow.document.head.appendChild(source.cloneNode(true));
      });
      pipWindow.document.body.replaceChildren();
      // PiP is a separate document. Runtime-injected styled-jsx rules in the
      // opener may not be present when the editor mounts here.
      const pipEditorStyles = pipWindow.document.createElement("style");
      pipEditorStyles.textContent = `
        .ourspace-rich-editor ul:not([data-type="taskList"]),
        .ourspace-rich-reader ul:not([data-type="taskList"]) {
          display: block !important; list-style: disc outside !important;
          padding-left: 1.7em !important; margin: .25em 0 !important;
        }
        .ourspace-rich-editor ol, .ourspace-rich-reader ol {
          display: block !important; list-style: decimal outside !important;
          padding-left: 1.7em !important; margin: .25em 0 !important;
        }
        .ourspace-rich-editor ul:not([data-type="taskList"]) > li,
        .ourspace-rich-editor ol > li,
        .ourspace-rich-reader ul:not([data-type="taskList"]) > li,
        .ourspace-rich-reader ol > li { display: list-item !important; }
        .ourspace-rich-editor ul[data-type="taskList"],
        .ourspace-rich-reader ul[data-type="taskList"] {
          list-style: none !important; padding-left: 0 !important;
        }
        .ourspace-rich-editor ul[data-type="taskList"] > li,
        .ourspace-rich-reader ul[data-type="taskList"] > li {
          display: flex !important; align-items: flex-start !important;
          flex-direction: row !important; flex-wrap: nowrap !important;
          gap: 8px !important; list-style: none !important;
        }
        .ourspace-rich-editor ul[data-type="taskList"] > li > label,
        .ourspace-rich-reader ul[data-type="taskList"] > li > label {
          display: flex !important; flex: 0 0 18px !important;
          width: 18px !important; align-items: flex-start !important;
          margin: 0 !important; padding-top: 4px !important;
        }
        .ourspace-rich-editor ul[data-type="taskList"] > li > div,
        .ourspace-rich-reader ul[data-type="taskList"] > li > div {
          display: block !important; flex: 1 1 0 !important;
          min-width: 0 !important; width: auto !important;
          overflow-wrap: anywhere !important;
        }
        .ourspace-rich-editor ul[data-type="taskList"] > li > div > p {
          min-height: 1.4em !important; margin: 0 !important;
        }
        .ourspace-rich-editor ul[data-type="taskList"] li[data-checked="true"] > div,
        .ourspace-rich-reader ul[data-type="taskList"] li[data-checked="true"] > div {
          color: #9CA69B !important;
          text-decoration: line-through !important;
          text-decoration-style: solid !important;
        }
      `;
      pipWindow.document.head.appendChild(pipEditorStyles);


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

      setFloatingCompact(pinnedMode === "compact");
      setFloatingWorkspaceOpen(pinnedMode === "workspace" || preferredWorkspaceOpen);
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
        focusText.floatingOpenFailed
      );
    }
  }

  /*
   * 播放结束提示音。
   *
   * 声音偏好统一来自 Settings V2 / user_preferences。
   * 静音只影响声音，不影响计时完成状态。
   */
  function playCompleteSound() {
    if (
      !preferences.sound_enabled
    ) {
      return;
    }

    const audio = new Audio(
      `/sounds/${preferences.focus_complete_sound}.mp3`
    );

    audio.volume =
      preferences.sound_volume;

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
    if (
      openFloating &&
      !disableFloatingWindow
    ) {
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
        focusText.startFailed +
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

  async function persistFocusAction(action: "pause" | "end" | "complete") {
    const { data, error } = await createClient().rpc("finish_focus_session", {
      p_todo_id: todo.id,
      p_action: action,
      p_expected_started_at: status === "running" ? startedAt : null,
    });
    if (error) throw error;
    return data as number;
  }

  /*
   * 暂停
   */
  async function pauseTimer() {
    if (busy || status !== "running") return;
    setBusy(true);
    try {
      const savedElapsed = await persistFocusAction("pause");
      setElapsedSeconds(savedElapsed);
      setStartedAt(null);
      setStatus("paused");
    } catch (error) {
      alert(focusText.pauseFailed + (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  /*
   * End this focus, not the parent Todo.
   * Preserve all accrued seconds so the task can be resumed later.
   * This is not yet a per-occurrence focus history record.
   */
  async function endFocusOnly() {
    if (busy || status === "completed") return;
    setBusy(true);
    try {
      const savedElapsed = await persistFocusAction("end");
      setElapsedSeconds(savedElapsed);
      setStartedAt(null);
      setStatus("paused");
      setTimeUp(false);
      setCompactFinishConfirm(false);
      closeFloatingTimer();
    } catch (error) {
      alert("结束本次专注失败 / Failed to end focus: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  function confirmWholeTask() {
    if (busy || status === "completed") return;
    setFinishConfirm(true);
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

    let actualElapsed: number;
    try {
      actualElapsed = await persistFocusAction("complete");
    } catch (error) {
      setBusy(false);
      alert(focusText.completeFailed + (error instanceof Error ? error.message : String(error)));
      return;
    }
    setBusy(false);

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

    const completionMessages =
      focusText.completionMessages;

    const randomMessage =
      completionMessages[
        Math.floor(
          Math.random() *
            completionMessages.length
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
        focusText.feedbackFailed
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
        focusText.resetFailed +
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
    <I18nProvider
      initialLanguage={preferences.language}
      userId={preferences.user_id}
    >
      {floatingCompact ? (
        <div style={{
          boxSizing: "border-box", width: "100%", height: "100vh",
          padding: "10px 12px 12px", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "space-between", gap: 6,
          background: "#FFFDFA", color: "#353934", userSelect: "none",
        }}>
          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button type="button" onClick={toggleFloatingCompact} disabled={busy}
              title={focusText.expandFloating} aria-label={focusText.expandFloating}
              style={{ ...buttonBase, width: 30, height: 26, display: "inline-flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8, background: "transparent", color: "#818A80",
                fontSize: 16 }}>↗</button>
            <button type="button" aria-pressed={pinnedMode === "compact"}
              aria-label={pinnedMode === "compact" ? "取消记住精简模式" : "记住精简模式"}
              title="记住精简模式（浏览器仍可拖动窗口）"
              onClick={() => setPinnedMode(current => current === "compact" ? null : "compact")}
              style={{ ...buttonBase, width: 30, height: 26, display: "inline-flex", alignItems: "center",
                justifyContent: "center", borderRadius: 8,
                background: pinnedMode === "compact" ? "#E9F1E7" : "transparent",
                color: pinnedMode === "compact" ? "#597356" : "#818A80",
                fontSize: 16 }}>{pinnedMode === "compact" ? "●" : "◇"}</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0, width: "100%" }}>
            <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px", color: "#353934",
              whiteSpace: "nowrap" }}>{floatingDisplayTime}</div>
            <div style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", fontSize: 10, color: timeUp ? "#A66D67" : "#858E84" }}>
              {floatingStatusText}
            </div>
          </div>
          {compactFinishConfirm ? (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#A66D67", textAlign: "center" }}>结束这次专注，还是完成整个任务？</span>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => void endFocusOnly()}
                  style={{ ...buttonBase, minWidth: 76, height: 30, borderRadius: 9, background: "#E4F0E6",
                    color: "#376649", fontSize: 11, fontWeight: 600 }}>结束本次</button>
                <button type="button" disabled={busy} onClick={() => void completeTimer()}
                  style={{ ...buttonBase, minWidth: 76, height: 30, borderRadius: 9, background: "#F5E2DF",
                    color: "#9B514C", fontSize: 11, fontWeight: 600 }}>确认完成</button>
                <button type="button" disabled={busy} onClick={() => setCompactFinishConfirm(false)}
                  style={{ ...buttonBase, minWidth: 54, height: 30, borderRadius: 9,
                    background: "#EFF0EC", color: "#657066", fontSize: 11 }}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
              <button type="button" disabled={busy || status === "completed"}
                onClick={status === "running" ? pauseTimer : () => startTimer(false)}
                title={status === "running" ? focusText.pause : focusText.continue}
                aria-label={status === "running" ? focusText.pause : focusText.continue}
                style={{ ...buttonBase, width: 44, height: 44, display: "inline-flex",
                  justifyContent: "center", alignItems: "center", borderRadius: "50%",
                  background: "#E9F1E7", color: "#597356",
                  opacity: busy ? 0.5 : 1 }}>
                {status === "running" ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              </button>
              <button type="button" disabled={busy || status === "completed"}
                onClick={() => setCompactFinishConfirm(true)}
                title="结束本次或完成任务（点击选择）" aria-label="结束本次或完成任务（点击选择）"
                style={{ ...buttonBase, width: 44, height: 44, display: "inline-flex",
                  justifyContent: "center", alignItems: "center", borderRadius: "50%",
                  background: "#EFF4EE", color: "#587361",
                  opacity: busy ? 0.5 : 1 }}>
                <Square size={17} fill="currentColor" />
              </button>
            </div>
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

        // Keep the timer controls visible; only the workspace scrolls.
        minHeight: 0,
        overflow: "hidden",

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
          onClick={toggleFloatingWorkspace}
          title={
            floatingWorkspaceOpen
              ? focusText.collapseWorkspace
              : focusText.openWorkspace
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
              ? focusText.hide
              : focusText.stepsAndNotes
          }
        </button>

        <button type="button"
          onClick={() => setPinnedMode(current => current === "workspace" ? null : "workspace")}
          title={pinnedMode === "workspace" ? "取消记住展开模式（不锁定窗口位置）" : "记住展开模式（不锁定窗口位置）"}
          aria-label={pinnedMode === "workspace" ? "取消记住展开模式" : "记住展开模式"}
          aria-pressed={pinnedMode === "workspace"}
          style={{...buttonBase, width:"25px", height:"25px", borderRadius:"999px",
            background:pinnedMode === "workspace" ? "#E9F1E7" : "transparent",
            color:pinnedMode === "workspace" ? "#597356" : "#999D96", fontSize:"14px"}}
        >{pinnedMode === "workspace" ? "●" : "◇"}</button>

        {/*
         * 收到侧边
         */}
        <button
          type="button"
          onClick={toggleFloatingCompact}
          title={focusText.collapseSide}
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
          title={focusText.closeFloating}
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
          {focusText.focusedFor.replace(
            "{time}",
            formatTime(currentElapsed)
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

            minWidth:
              0,

            flex:
              1,

            overflow:
              "hidden",

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
              {focusText.continueFocus}
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
              {focusText.complete}
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
                title={focusText.pause}
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
                title={focusText.continue}
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

            <button type="button" disabled={busy || status === "completed"}
              onClick={() => void endFocusOnly()}
              title="结束本次专注（Todo 保持未完成）"
              aria-label="结束本次专注（Todo 保持未完成）"
              style={{ ...buttonBase, height: "34px", minWidth: "72px", padding: "0 10px",
                borderRadius: "12px", background: "#E8F1E8", color: "#43694B",
                fontSize: "11px", fontWeight: 600 }}>
              结束本次
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => { if (window.confirm("确定完成整个 Todo 吗？如果只是结束本次专注，请选择「结束本次」。")) void completeTimer(); }}
              title={focusText.completeTask}
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
  )}
    </I18nProvider>
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
    pinnedMode,
    compactFinishConfirm,
    focusText,
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
          {focusText.completedTitle}
        </p>

        <h1 className="mt-2 max-w-lg text-2xl font-semibold">
          {todo.title}
        </h1>

        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
          {completionMessage}
        </p>

        <div className="card mt-7 px-8 py-5">
          <p className="text-xs text-ink-faint">
            {focusText.thisFocus}
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
              {focusText.completionQuestion}
            </h2>

            <p className="mt-1 text-xs text-ink-faint">
              {focusText.completionHint}
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
                        focusText.completionLevels[
                          item.value
                        ].label
                      }
                    </span>

                    <span className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                      {
                        focusText.completionLevels[
                          item.value
                        ].description
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
                {common.saving}
              </span>
            )}

            {!feedbackSaving &&
              feedbackSaved && (
                <span className="text-sage-700">
                  {focusText.feedbackSaved}
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
                  {focusText.skipFeedback}
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
            {focusText.backToTasks}
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
            {focusText.backToToday}
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
          ? focusText.status.roundTimeUp
          : status ===
              "running"
            ? focusText.status.focusing
            : status ===
                "paused"
              ? focusText.status.paused
              : status ===
                  "completed"
                ? focusText.status.completed
                : focusText.status.ready}
      </p>

      <h1 className="mt-3 max-w-lg text-center text-2xl font-semibold">
        {todo.title}
      </h1>
      <div className="mt-5 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-full border border-[#E4EAE3] bg-[#FCFDFB] px-5 py-2.5 text-center shadow-sm sm:gap-x-7">
          <div><span className="block text-[10px] tracking-wide text-ink-faint">预计</span><strong className="block text-sm font-medium tabular-nums text-ink">{todo.estimated_minutes != null ? `${todo.estimated_minutes} 分钟` : "未设定"}</strong></div>
          <span className="h-6 w-px bg-[#E4EAE3]" aria-hidden="true" />
          <div><span className="block text-[10px] tracking-wide text-ink-faint">已专注</span><strong className="block text-sm font-semibold tabular-nums text-sage-700">{Math.floor(currentElapsed / 60)} 分钟</strong></div>
          {todo.estimated_minutes != null && <>
            <span className="h-6 w-px bg-[#E4EAE3]" aria-hidden="true" />
            <div><span className="block text-[10px] tracking-wide text-ink-faint">参考剩余</span><strong className="block text-sm font-medium tabular-nums text-ink">{Math.max(0, todo.estimated_minutes - Math.floor(currentElapsed / 60))} 分钟</strong></div>
          </>}
        </div>
        <p className="text-center text-xs leading-relaxed text-[#7D9181]">{focusEncouragement}</p>
      </div>

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
              ? focusText.focusedFor.replace(
                  "{time}",
                  formatTime(currentElapsed)
                )
              : focusText.focusedTime}
          </p>
        </div>
      </div>

      {/*
       * 时间到
       */}
      {timeUp && (
        <div className="mt-7 w-full max-w-sm rounded-2xl border border-sage-100 bg-sage-50 px-5 py-5 text-center">
          <p className="font-medium text-sage-700">
            {focusText.timeUpTitle}
          </p>

          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {focusText.timeUpHint}
          </p>

          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => void endFocusOnly()} disabled={busy}
              className="rounded-xl border border-sage-300 bg-white px-4 py-2 text-sm font-medium text-sage-700">
              结束本次专注（保留任务）
            </button>
          </div>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={
                continueAfterTimeUp
              }
              disabled={busy}
              className="rounded-xl bg-sage-100 px-4 py-2.5 text-sm font-medium text-sage-700 transition hover:bg-sage-300/60"
            >
              {focusText.continueFocus}
            </button>

            <button
              type="button"
              onClick={confirmWholeTask}
              disabled={busy}
              className="rounded-xl bg-blush-100 px-4 py-2.5 text-sm font-medium text-blush-500 transition hover:bg-blush-50"
            >
              {focusText.completeTask}
            </button>
          </div>
        </div>
      )}

      {/*
       * 普通控制
       */}
      {!timeUp && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={status === "running" ? () => void pauseTimer() : () => void startTimer(true)}
              disabled={busy || status === "completed"}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-sage-100 px-5 py-3 text-sm font-semibold text-sage-700 shadow-sm transition hover:bg-sage-200/70 disabled:opacity-50">
              {status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {status === "running" ? focusText.pause : focusText.startOrContinue}
            </button>
            <button type="button" onClick={() => void endFocusOnly()}
              disabled={busy || status === "completed"}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-[#D9E4D9] bg-[#F8FAF7] px-4 py-3 text-sm font-medium text-[#597461] transition hover:border-[#B5CBB8] hover:bg-[#EEF5EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#71987A] disabled:opacity-50">
              <Square className="h-4 w-4" />
              结束本次
            </button>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={confirmWholeTask} disabled={busy || status === "completed"}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-ink-soft transition hover:bg-sage-50 hover:text-sage-700 disabled:opacity-50">
              <Check className="h-4 w-4" /> 完成整个任务
            </button>
            <button type="button" onClick={() => {
              if(window.confirm("重置会清零本任务累计的专注时间，确定继续吗？")) void resetTimer();
            }} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-ink-faint transition hover:bg-mist-50"
              title={focusText.reset}>
              <RotateCcw className="h-3.5 w-3.5" /> 重置
            </button>
          </div>
        </div>
      )}
      {finishConfirm && <div role="dialog" aria-modal="true" aria-label="确认完成整个任务"
        className="mt-4 w-full max-w-sm rounded-2xl border border-line bg-white p-4 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink">确定完成整个任务吗？</p>
        <p className="mt-1 text-xs text-ink-soft">这会将 Todo 标记为已完成，不只是结束本次专注。</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" disabled={busy} onClick={() => {setFinishConfirm(false);void completeTimer();}}
            className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-medium text-white">确认完成</button>
          <button type="button" onClick={() => setFinishConfirm(false)}
            className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft">取消</button>
        </div>
      </div>}

      {/*
       * Floating window control
       *
       * 正常开始时自动打开。
       * 如果用户自己 × 掉，
       * 可以在这里重新打开。
       */}
      {!disableFloatingWindow &&
        status !==
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
              {focusText.openMini}
            </button>
          )}

          {floatingOpen && (
            <p className="text-xs text-sage-700">
              {focusText.miniOpened}
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
          ← {focusText.backToToday}
        </button>
      </div>
    </div>
  );
}
