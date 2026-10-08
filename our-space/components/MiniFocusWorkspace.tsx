"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";

type Tab =
  | "steps"
  | "notes";

type MiniSubtask = {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
};

type MiniNote = {
  id: string;
  subtask_id: string | null;
  title: string | null;
  content: string;
  color: string;
  sort_order: number;
  updated_at: string;
};

type Props = {
  todoId: string;
};

const buttonBase: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function MiniFocusWorkspace({
  todoId,
}: Props) {
  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "steps"
    );

  const [
    subtasks,
    setSubtasks,
  ] =
    useState<
      MiniSubtask[]
    >([]);

  const [
    notes,
    setNotes,
  ] =
    useState<
      MiniNote[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    draft,
    setDraft,
  ] =
    useState("");

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const supabase =
          createClient();

        const [
          subtasksResult,
          notesResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "todo_subtasks"
              )
              .select(
                "id, title, completed, completed_at, sort_order"
              )
              .eq(
                "todo_id",
                todoId
              )
              .order(
                "sort_order",
                {
                  ascending:
                    true,
                }
              )
              .order(
                "created_at",
                {
                  ascending:
                    true,
                }
              ),

            supabase
              .from(
                "quick_notes"
              )
              .select(
                "id, subtask_id, title, content, color, sort_order, updated_at"
              )
              .eq(
                "todo_id",
                todoId
              )
              .order(
                "updated_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(12),
          ]);

        if (cancelled) {
          return;
        }

        if (
          subtasksResult.error
        ) {
          setError(
            mini.loadStepsFailed +
              subtasksResult.error
                .message
          );
        } else {
          setSubtasks(
            (subtasksResult.data ??
              []) as MiniSubtask[]
          );
        }

        if (
          notesResult.error
        ) {
          setError(
            mini.loadNotesFailed +
              notesResult.error
                .message
          );
        } else {
          setNotes(
            (notesResult.data ??
              []) as MiniNote[]
          );
        }
      } catch (
        unknownError
      ) {
        setError(
          unknownError instanceof
            Error
            ? unknownError.message
            : String(
                unknownError
              )
        );
      } finally {
        if (!cancelled) {
          setLoading(
            false
          );
        }
      }
    }

    void load();

    return () => {
      cancelled =
        true;
    };
  }, [todoId]);

  /*
   * V1：第一个未完成 Step 视为“当前 Step”。
   *
   * 后续如果要让用户主动 pin 某个 Step，
   * 再单独增加 current_subtask_id。
   */
  const currentSubtask =
    useMemo(
      () =>
        subtasks.find(
          (subtask) =>
            !subtask.completed
        ) ?? null,
      [subtasks]
    );

  async function toggleSubtask(
    subtask:
      MiniSubtask
  ) {
    if (busy) {
      return;
    }

    const previous =
      subtasks;

    const completed =
      !subtask.completed;

    const completedAt =
      completed
        ? new Date().toISOString()
        : null;

    setBusy(true);
    setError(null);

    setSubtasks(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            subtask.id
              ? {
                  ...item,
                  completed,
                  completed_at:
                    completedAt,
                }
              : item
        )
    );

    try {
      const supabase =
        createClient();

      const {
        error:
          updateError,
      } =
        await supabase
          .from(
            "todo_subtasks"
          )
          .update({
            completed,
            completed_at:
              completedAt,
          })
          .eq(
            "id",
            subtask.id
          );

      if (
        updateError
      ) {
        setSubtasks(
          previous
        );

        setError(
          mini.updateStepFailed +
            updateError.message
        );
      }
    } catch (
      unknownError
    ) {
      setSubtasks(
        previous
      );

      setError(
        mini.updateStepFailed +
          (
            unknownError instanceof
              Error
              ? unknownError.message
              : String(
                  unknownError
                )
          )
      );
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    const content =
      draft.trim();

    if (
      !content ||
      busy
    ) {
      return;
    }

    const targetSubtaskId =
      currentSubtask
        ?.id ?? null;

    const sameSection =
      notes.filter(
        (note) =>
          note.subtask_id ===
          targetSubtaskId
      );

    const sortOrder =
      sameSection.length ===
      0
        ? 1000
        : Math.max(
            ...sameSection.map(
              (note) =>
                note.sort_order
            )
          ) + 1000;

    setBusy(true);
    setError(null);

    try {
      const supabase =
        createClient();

      const {
        data,
        error:
          insertError,
      } =
        await supabase
          .from(
            "quick_notes"
          )
          .insert({
            todo_id:
              todoId,
            subtask_id:
              targetSubtaskId,
            title:
              null,
            content,
            color:
              "cream",
            sort_order:
              sortOrder,
          })
          .select(
            "id, subtask_id, title, content, color, sort_order, updated_at"
          )
          .single();

      if (
        insertError ||
        !data
      ) {
        setError(
          mini.addNoteFailed +
            (
              insertError
                ?.message ??
              mini.missingData
            )
        );

        return;
      }

      setNotes(
        (current) => [
          data as MiniNote,
          ...current,
        ]
      );

      setDraft("");
    } catch (
      unknownError
    ) {
      setError(
        mini.addNoteFailed +
          (
            unknownError instanceof
              Error
              ? unknownError.message
              : String(
                  unknownError
                )
          )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: 0,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        border: "1px solid #ECEAE5",
        borderRadius: "14px",
        background: "#FFFEFC",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #ECEAE5",
          background: "#FAF8F4",
        }}
      >
        {(
          [
            ["steps", mini.steps],
            ["notes", mini.notes],
          ] as const
        ).map(
          ([value, label]) => (
            <button
              key={
                value
              }
              type="button"
              onClick={() =>
                setTab(
                  value
                )
              }
              style={{
                ...buttonBase,
                flex: 1,
                height: "34px",
                background: "transparent",
                borderBottom:
                  tab === value
                    ? "2px solid #93AC8A"
                    : "2px solid transparent",
                color:
                  tab === value
                    ? "#597356"
                    : "#999D96",
                fontSize: "10px",
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      <div
        style={{
          minHeight: 0,
          flex: 1,
          overflowY: "auto",
          padding: "10px",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: "22px 8px",
              textAlign: "center",
              fontSize: "10px",
              color: "#999D96",
            }}
          >
            {mini.loading}
          </div>
        ) : tab ===
          "steps" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {currentSubtask && (
              <div
                style={{
                  padding: "8px 9px",
                  borderRadius: "10px",
                  background: "#F0F5EE",
                  border: "1px solid #DDE8D8",
                }}
              >
                <div
                  style={{
                    fontSize: "8px",
                    fontWeight: 700,
                    color: "#597356",
                    letterSpacing: "0.08em",
                  }}
                >
                  {mini.currentStep}
                </div>

                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "10px",
                    color: "#4A5048",
                    lineHeight: 1.4,
                  }}
                >
                  {
                    currentSubtask.title
                  }
                </div>
              </div>
            )}

            {subtasks.length ===
            0 ? (
              <div
                style={{
                  padding: "18px 8px",
                  textAlign: "center",
                  fontSize: "10px",
                  color: "#999D96",
                }}
              >
                {mini.noSteps}
              </div>
            ) : (
              subtasks.map(
                (
                  subtask,
                  index
                ) => {
                  const current =
                    currentSubtask
                      ?.id ===
                    subtask.id;

                  return (
                    <button
                      key={
                        subtask.id
                      }
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        void toggleSubtask(
                          subtask
                        )
                      }
                      style={{
                        ...buttonBase,
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 9px",
                        borderRadius: "10px",
                        background:
                          current
                            ? "#F7FAF6"
                            : "#FFFFFF",
                        border:
                          current
                            ? "1px solid #DDE8D8"
                            : "1px solid #F0EEE9",
                        color:
                          subtask.completed
                            ? "#A1A59F"
                            : "#4A5048",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: "24px",
                          flex: "0 0 auto",
                          fontSize: "9px",
                          fontWeight: 700,
                          color:
                            current
                              ? "#597356"
                              : "#A1A59F",
                        }}
                      >
                        {
                          String(
                            index +
                              1
                          ).padStart(
                            2,
                            "0"
                          )
                        }
                      </span>

                      <span
                        style={{
                          width: "15px",
                          height: "15px",
                          flex: "0 0 auto",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          border:
                            subtask.completed
                              ? "1px solid #93AC8A"
                              : "1px solid #BCC0BA",
                          background:
                            subtask.completed
                              ? "#E9F1E7"
                              : "transparent",
                          color: "#597356",
                          fontSize: "9px",
                        }}
                      >
                        {
                          subtask.completed
                            ? "✓"
                            : ""
                        }
                      </span>

                      <span
                        style={{
                          minWidth: 0,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textDecoration:
                            subtask.completed
                              ? "line-through"
                              : "none",
                          fontSize: "10px",
                        }}
                      >
                        {
                          subtask.title
                        }
                      </span>
                    </button>
                  );
                }
              )
            )}
          </div>
        ) : (
          <div>
            <div
              style={{
                padding: "9px",
                borderRadius: "11px",
                background: "#F8F6F1",
                border: "1px solid #ECEAE5",
              }}
            >
              <textarea
                value={
                  draft
                }
                onChange={(
                  event
                ) =>
                  setDraft(
                    event.target
                      .value
                  )
                }
                rows={2}
                placeholder={
                  currentSubtask
                    ? mini.noteForCurrentStep
                    : mini.quickNote
                }
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  resize: "none",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#4A5048",
                  fontFamily: "inherit",
                  fontSize: "10px",
                  lineHeight: 1.45,
                }}
              />

              <div
                style={{
                  marginTop: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "8px",
                    color: "#999D96",
                  }}
                >
                  {
                    currentSubtask
                      ? "→ " +
                        currentSubtask.title
                      : "→ " + mini.unsorted
                  }
                </span>

                <button
                  type="button"
                  disabled={
                    busy ||
                    !draft.trim()
                  }
                  onClick={() =>
                    void addNote()
                  }
                  style={{
                    ...buttonBase,
                    minWidth: "44px",
                    height: "24px",
                    padding: "0 9px",
                    borderRadius: "8px",
                    background: "#E9F1E7",
                    color: "#597356",
                    fontSize: "9px",
                    fontWeight: 700,
                    opacity:
                      busy ||
                      !draft.trim()
                        ? 0.5
                        : 1,
                  }}
                >
                  {mini.add}
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {notes.length ===
              0 ? (
                <div
                  style={{
                    padding: "18px 8px",
                    textAlign: "center",
                    fontSize: "10px",
                    color: "#999D96",
                  }}
                >
                  No notes yet.
                </div>
              ) : (
                notes
                  .slice(
                    0,
                    6
                  )
                  .map(
                    (
                      note
                    ) => (
                      <div
                        key={
                          note.id
                        }
                        style={{
                          padding: "8px 9px",
                          borderRadius: "10px",
                          border: "1px solid #F0EEE9",
                          background: "#FFFDF8",
                        }}
                      >
                        {note.title && (
                          <div
                            style={{
                              marginBottom: "3px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: "9px",
                              fontWeight: 700,
                              color: "#4A5048",
                            }}
                          >
                            {
                              note.title
                            }
                          </div>
                        )}

                        <div
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            fontSize: "9px",
                            lineHeight: 1.45,
                            color: "#73786F",
                          }}
                        >
                          {
                            note.content
                          }
                        </div>
                      </div>
                    )
                  )
              )}
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "8px",
              padding: "7px 8px",
              borderRadius: "9px",
              background: "#F8EDEA",
              color: "#A66D67",
              fontSize: "9px",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
