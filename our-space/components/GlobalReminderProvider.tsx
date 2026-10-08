"use client";

import {
  Bell,
  CalendarDays,
  Play,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  PREFERENCES_BROADCAST_CHANNEL,
  PREFERENCES_UPDATED_EVENT,
  type UserPreferences,
} from "@/lib/preferences";

type ReminderSession = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  reminder_minutes_before: number | null;
};

type ReminderTodo = {
  id: string;
  title: string;
  status: string;
  todo_sessions: ReminderSession[];
};

type ActiveReminder = {
  key: string;
  todoId: string;
  todoTitle: string;
  sessionId: string;
  scheduledStart: string;
  scheduledEnd: string;
  minutesBefore: number;
};

type Props = {
  userId: string;
  initialPreferences: UserPreferences;
};

const POLL_MS = 30_000;
const FIRE_WINDOW_MS = 90_000;
const STORAGE_PREFIX = "ourspace-reminder-fired:";

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function reminderLabel(minutesBefore: number) {
  if (minutesBefore === 0) {
    return "现在开始";
  }

  if (minutesBefore === 60) {
    return "1 小时后开始";
  }

  return `${minutesBefore} 分钟后开始`;
}

function reminderKey(
  session: ReminderSession
) {
  return [
    session.id,
    session.scheduled_start,
    session.reminder_minutes_before ?? "none",
  ].join(":");
}

export default function GlobalReminderProvider({
  userId,
  initialPreferences,
}: Props) {
  const router = useRouter();

  const [
    preferences,
    setPreferences,
  ] = useState(
    initialPreferences
  );

  const [
    activeReminder,
    setActiveReminder,
  ] =
    useState<ActiveReminder | null>(
      null
    );

  const checkingRef =
    useRef(false);

  const dismissTimerRef =
    useRef<number | null>(
      null
    );

  useEffect(() => {
    function handlePreferenceEvent(
      event: Event
    ) {
      const custom =
        event as CustomEvent<UserPreferences>;

      if (
        custom.detail?.user_id ===
        userId
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
            userId
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
  }, [userId]);

  const dismiss =
    useCallback(() => {
      setActiveReminder(null);

      if (
        dismissTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          dismissTimerRef.current
        );

        dismissTimerRef.current =
          null;
      }
    }, []);

  const showReminder =
    useCallback(
      (
        todo: ReminderTodo,
        session:
          ReminderSession
      ) => {
        const minutesBefore =
          session.reminder_minutes_before;

        if (
          minutesBefore === null
        ) {
          return;
        }

        const key =
          reminderKey(session);

        try {
          localStorage.setItem(
            STORAGE_PREFIX + key,
            "1"
          );
        } catch {
          // localStorage unavailable should not block reminders.
        }

        const next: ActiveReminder =
          {
            key,
            todoId: todo.id,
            todoTitle:
              todo.title,
            sessionId:
              session.id,
            scheduledStart:
              session.scheduled_start,
            scheduledEnd:
              session.scheduled_end,
            minutesBefore,
          };

        setActiveReminder(next);

        /*
         * Settings V2:
         * Reminder 使用自己独立的提醒音，但和 Focus
         * 共用声音总开关及音量。
         *
         * 静音不会阻止 Toast / Browser Notification。
         */
        if (
          preferences.sound_enabled
        ) {
          try {
            const audio =
              new Audio(
                `/sounds/${preferences.reminder_sound}.mp3`
              );

            audio.volume =
              preferences.sound_volume;

            void audio
              .play()
              .catch(() => {});
          } catch {
            // Audio failure does not block the visual reminder.
          }
        }

        if (
          typeof Notification !==
            "undefined" &&
          Notification.permission ===
            "granted"
        ) {
          try {
            const notification =
              new Notification(
                todo.title,
                {
                  body:
                    reminderLabel(
                      minutesBefore
                    ) +
                    " · " +
                    formatClock(
                      session.scheduled_start
                    ),
                  icon:
                    "/icon-192.png",
                  tag:
                    "ourspace-" +
                    key,
                }
              );

            notification.onclick =
              () => {
                window.focus();
                router.push(
                  "/calendar"
                );
                notification.close();
              };
          } catch {
            // Browser/system notification is optional.
          }
        }

        if (
          dismissTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            dismissTimerRef.current
          );
        }

        dismissTimerRef.current =
          window.setTimeout(
            () => {
              setActiveReminder(
                (current) =>
                  current?.key ===
                  key
                    ? null
                    : current
              );
            },
            60_000
          );
      },
      [router]
    );

  const checkReminders =
    useCallback(async () => {
      if (
        checkingRef.current
      ) {
        return;
      }

      checkingRef.current =
        true;

      try {
        const supabase =
          createClient();

        const {
          data,
          error,
        } =
          await supabase
            .from("todos")
            .select(`
              id,
              title,
              status,
              todo_sessions (
                id,
                scheduled_start,
                scheduled_end,
                reminder_minutes_before
              )
            `)
            .eq(
              "user_id",
              userId
            )
            .neq(
              "status",
              "completed"
            );

        if (error) {
          /*
           * Before reminder_v1.sql is applied the new column does not exist.
           * Silently skip instead of breaking every app page.
           */
          return;
        }

        const now =
          Date.now();

        const todos =
          (data ??
            []) as ReminderTodo[];

        const due: {
          todo: ReminderTodo;
          session:
            ReminderSession;
          reminderAt: number;
        }[] = [];

        for (
          const todo of todos
        ) {
          for (
            const session of
              todo.todo_sessions ??
              []
          ) {
            if (
              session.reminder_minutes_before ===
              null
            ) {
              continue;
            }

            const startMs =
              new Date(
                session.scheduled_start
              ).getTime();

            const reminderAt =
              startMs -
              session.reminder_minutes_before *
                60_000;

            if (
              reminderAt > now ||
              reminderAt <
                now -
                  FIRE_WINDOW_MS
            ) {
              continue;
            }

            const key =
              reminderKey(
                session
              );

            let alreadyFired =
              false;

            try {
              alreadyFired =
                localStorage.getItem(
                  STORAGE_PREFIX +
                    key
                ) === "1";
            } catch {
              // Continue without persistent dedupe.
            }

            if (
              !alreadyFired
            ) {
              due.push({
                todo,
                session,
                reminderAt,
              });
            }
          }
        }

        /*
         * If multiple reminders become due together,
         * show the earliest one first.
         */
        due.sort(
          (a, b) =>
            a.reminderAt -
            b.reminderAt
        );

        if (due[0]) {
          showReminder(
            due[0].todo,
            due[0].session
          );
        }
      } finally {
        checkingRef.current =
          false;
      }
    }, [
      userId,
      showReminder,
    ]);

  useEffect(() => {
    void checkReminders();

    const timer =
      window.setInterval(
        () => {
          void checkReminders();
        },
        POLL_MS
      );

    const onVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void checkReminders();
        }
      };

    window.addEventListener(
      "focus",
      checkReminders
    );

    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    return () => {
      window.clearInterval(
        timer
      );

      window.removeEventListener(
        "focus",
        checkReminders
      );

      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );

      if (
        dismissTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          dismissTimerRef.current
        );
      }
    };
  }, [checkReminders]);

  if (!activeReminder) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[100] w-[min(360px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-[20px] border border-sage-200 bg-white/95 shadow-[0_18px_50px_rgba(60,70,58,0.18)] backdrop-blur">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700">
            <Bell className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-sage-700">
              {reminderLabel(
                activeReminder.minutesBefore
              )}
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-ink">
              {
                activeReminder.todoTitle
              }
            </p>

            <p className="mt-1 text-[11px] tabular-nums text-ink-faint">
              {formatClock(
                activeReminder.scheduledStart
              )}
              {" – "}
              {formatClock(
                activeReminder.scheduledEnd
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper hover:text-ink"
            aria-label="关闭提醒"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 border-t border-line/70">
          <button
            type="button"
            onClick={() => {
              dismiss();
              router.push(
                "/calendar"
              );
            }}
            className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium text-ink-soft transition hover:bg-paper"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            查看日历
          </button>

          <button
            type="button"
            onClick={() => {
              const todoId =
                activeReminder.todoId;

              dismiss();

              router.push(
                `/focus/${todoId}`
              );
            }}
            className="flex items-center justify-center gap-2 border-l border-line/70 bg-sage-50 px-3 py-3 text-xs font-medium text-sage-700 transition hover:bg-sage-100"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            开始专注
          </button>
        </div>
      </div>
    </div>
  );
}
