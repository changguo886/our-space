"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import QuickNoteMarkdown from "@/components/QuickNoteMarkdown";
import type { JSONContent } from "@tiptap/core";
import QuickNotesRichTextField from "@/components/editor/QuickNotesRichTextField";
import RichTextReadOnly from "@/components/editor/RichTextReadOnly";
import { initialRichText } from "@/lib/editor/richTextBridge";

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
  content_json: JSONContent | null;
  color: string;
  sort_order: number;
  updated_at: string;
};

type Props = {
  todoId: string;
};

function readSessionValue(key: string, fallback: string) {
  try {
    return window.sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

const buttonBase: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

function SortableMiniStep({
  subtask,
  index,
  current,
  busy,
  onToggle,
}: {
  subtask: MiniSubtask;
  index: number;
  current: boolean;
  busy: boolean;
  onToggle: (subtask: MiniSubtask) => void;
}) {
  const { dictionary } = useI18n();
  const mini = dictionary.focus.mini;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: subtask.id,
    disabled: busy,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 9px",
        borderRadius: "10px",
        background: isDragging
          ? "#F0F5EE"
          : current
            ? "#F7FAF6"
            : "#FFFFFF",
        border: current
          ? "1px solid #DDE8D8"
          : "1px solid #F0EEE9",
        color: subtask.completed
          ? "#A1A59F"
          : "#4A5048",
        opacity: isDragging ? 0.78 : 1,
        boxShadow: isDragging
          ? "0 8px 24px rgba(60,50,40,0.10)"
          : "none",
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={busy}
        title={mini.reorder}
        aria-label={mini.reorder}
        style={{
          ...buttonBase,
          width: "24px",
          flex: "0 0 auto",
          padding: 0,
          background: "transparent",
          color: current ? "#597356" : "#A1A59F",
          fontSize: "9px",
          fontWeight: 700,
          cursor: busy ? "default" : "grab",
          touchAction: "none",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(subtask)}
        style={{
          ...buttonBase,
          width: "15px",
          height: "15px",
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          borderRadius: "999px",
          border: subtask.completed
            ? "1px solid #93AC8A"
            : "1px solid #BCC0BA",
          background: subtask.completed
            ? "#E9F1E7"
            : "transparent",
          color: "#597356",
          fontSize: "9px",
        }}
      >
        {subtask.completed ? "✓" : ""}
      </button>

      <span
        style={{
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: subtask.completed
            ? "line-through"
            : "none",
          fontSize: "10px",
        }}
      >
        {subtask.title}
      </span>
    </div>
  );
}

export default function MiniFocusWorkspace({
  todoId,
}: Props) {
  const { dictionary, language } = useI18n();
  const mini = dictionary.focus.mini;
  const labels = language === "zh-CN"
    ? { expand: "展开全文", collapse: "收起", edit: "编辑", save: "保存", cancel: "取消", saveFailed: "更新笔记失败：" }
    : { expand: "Read more", collapse: "Show less", edit: "Edit", save: "Save", cancel: "Cancel", saveFailed: "Could not update note: " };

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(() => {
      const saved = readSessionValue(
        `ourspace:mini-focus:tab:${todoId}`,
        "steps"
      );
      return saved === "notes" ? "notes" : "steps";
    });

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
    useState(() =>
      readSessionValue(
        `ourspace:mini-focus:draft:${todoId}`,
        ""
      )
    );

  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(
    () => new Set()
  );
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingJson, setEditingJson] = useState<JSONContent>(() => initialRichText(""));
  const [draftJson, setDraftJson] = useState<JSONContent>(() => initialRichText(readSessionValue(`ourspace:mini-focus:draft:${todoId}`, "")));

  function startEdit(note: MiniNote) {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
    setEditingJson(initialRichText(note.content, note.content_json));
    setExpandedNoteIds((current) => new Set(current).add(note.id));
    setError(null);
  }

  async function saveEditedNote(note: MiniNote) {
    const content = editingContent.trim();
    if (busy || !content) {
      if (!busy && !content) setEditingNoteId(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data, error: updateError } = await createClient()
        .from("quick_notes")
        .update({ content, content_json: editingJson })
        .eq("id", note.id)
        .eq("todo_id", todoId)
        .select("id, content, content_json, updated_at")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message ?? "No data returned");
      }

      setNotes((current) => current.map((item) =>
        item.id === note.id
          ? { ...item, content: data.content, content_json: data.content_json as JSONContent, updated_at: data.updated_at }
          : item
      ));
      setEditingNoteId(null);
    } catch (unknownError) {
      setError(labels.saveFailed + (
        unknownError instanceof Error ? unknownError.message : String(unknownError)
      ));
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(note: MiniNote) {
    if (busy || !window.confirm("删除这条笔记？此操作无法撤销。")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: deleteError } = await createClient()
        .from("quick_notes")
        .delete()
        .eq("id", note.id)
        .eq("todo_id", todoId);
      if (deleteError) throw deleteError;
      setNotes(current => current.filter(item => item.id !== note.id));
      if (editingNoteId === note.id) {
        setEditingNoteId(null);
        setEditingContent("");
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : String(unknownError));
    } finally {
      setBusy(false);
    }
  }

  // Preserve the selected tab and unfinished note across PiP
  // collapse / expand and normal component remounts.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        `ourspace:mini-focus:tab:${todoId}`,
        tab
      );
    } catch {
      // Storage may be unavailable in restrictive browser contexts.
    }
  }, [todoId, tab]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        `ourspace:mini-focus:draft:${todoId}`,
        draft
      );
    } catch {
      // Keep the in-memory draft when storage is unavailable.
    }
  }, [todoId, draft]);

    const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

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
                "id, subtask_id, title, content, content_json, color, sort_order, updated_at"
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

  async function handleStepDragEnd(
    event: DragEndEvent
  ) {
    const { active, over } = event;

    if (
      !over ||
      active.id === over.id ||
      busy
    ) {
      return;
    }

    const oldIndex = subtasks.findIndex(
      (item) => item.id === active.id
    );
    const newIndex = subtasks.findIndex(
      (item) => item.id === over.id
    );

    if (
      oldIndex < 0 ||
      newIndex < 0
    ) {
      return;
    }

    const previous = subtasks;
    const reordered = arrayMove(
      previous,
      oldIndex,
      newIndex
    ).map((item, index) => ({
      ...item,
      sort_order: index,
    }));

    setSubtasks(reordered);
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const results = await Promise.all(
        reordered.map((item) =>
          supabase
            .from("todo_subtasks")
            .update({
              sort_order: item.sort_order,
            })
            .eq("id", item.id)
        )
      );

      const updateError = results.find(
        (result) => result.error
      )?.error;

      if (updateError) {
        setSubtasks(previous);
        setError(
          mini.saveOrderFailed +
            updateError.message
        );
      }
    } catch {
      setSubtasks(previous);
      setError(
        mini.saveOrderFailedShort
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
            content_json: draftJson,
            color:
              "cream",
            sort_order:
              sortOrder,
          })
          .select(
            "id, subtask_id, title, content, content_json, color, sort_order, updated_at"
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
      setDraftJson(initialRichText(""));
      try {
        window.sessionStorage.removeItem(
          `ourspace:mini-focus:draft:${todoId}`
        );
      } catch {
        // Saving the note succeeded even if storage cleanup fails.
      }
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
        minWidth: 0,
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
          flexShrink: 0,
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
                setTab(value)
              }
              aria-selected={tab === value}
              role="tab"
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
          minWidth: 0,
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleStepDragEnd}
              >
                <SortableContext
                  items={subtasks.map(
                    (item) => item.id
                  )}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {subtasks.map(
                      (subtask, index) => (
                        <SortableMiniStep
                          key={subtask.id}
                          subtask={subtask}
                          index={index}
                          current={
                            currentSubtask?.id ===
                            subtask.id
                          }
                          busy={busy}
                          onToggle={(item) =>
                            void toggleSubtask(item)
                          }
                        />
                      )
                    )}
                  </div>
                </SortableContext>
              </DndContext>
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
              <QuickNotesRichTextField compact value={draft} contentJson={draftJson}
                onChange={(text, json) => { setDraft(text); setDraftJson(json); }}
                placeholder={currentSubtask ? mini.noteForCurrentStep : mini.quickNote} />
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
                  {mini.noNotes}
                </div>
              ) : (
                notes
                  .slice(0, 6)
                  .map((note) => {
                    const expanded = expandedNoteIds.has(note.id);
                    const editing = editingNoteId === note.id;
                    const hasMore = note.content.length > 110 || note.content.includes("\n");

                    return (
                      <div
                        key={note.id}
                        style={{
                          padding: "8px 9px",
                          borderRadius: "10px",
                          border: "1px solid #F0EEE9",
                          background: "#FFFDF8",
                          minWidth: 0,
                        }}
                      >
                        {note.title && (
                          <div style={{
                            marginBottom: "5px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "9px",
                            fontWeight: 700,
                            color: "#4A5048",
                          }}>
                            {note.title}
                          </div>
                        )}

                        {editing ? (
                          <>
                          <QuickNotesRichTextField compact value={editingContent} contentJson={editingJson}
                             onChange={(text, json) => { setEditingContent(text); setEditingJson(json); }} placeholder={labels.edit} />
                          </>
                        ) : (
                          <div style={{ overflowWrap: "anywhere", fontSize: "11px", color: "#73786F" }}>
                            {expanded ? (
                              note.content_json ? <RichTextReadOnly value={note.content_json} /> : <QuickNoteMarkdown content={note.content} compact />
                            ) : (
                              <div style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                                {note.content}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "10px",
                          marginTop: "7px",
                          flexWrap: "wrap",
                        }}>
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingNoteId(null);
                                  setEditingContent("");
                                  setError(null);
                                }}
                                style={{ ...buttonBase, background: "transparent", color: "#858980", fontSize: "10px" }}
                              >
                                {labels.cancel}
                              </button>
                              <button
                                type="button"
                                disabled={busy || !editingContent.trim()}
                                onClick={() => void saveEditedNote(note)}
                                style={{
                                  ...buttonBase,
                                  background: "#E9F1E7",
                                  borderRadius: "6px",
                                  padding: "4px 10px",
                                  color: "#597356",
                                  fontWeight: 600,
                                  opacity: busy || !editingContent.trim() ? 0.5 : 1,
                                  fontSize: "10px",
                                }}
                              >
                                {labels.save}
                              </button>
                            </>
                          ) : (
                            <>
                              {hasMore && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedNoteIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(note.id)) next.delete(note.id);
                                    else next.add(note.id);
                                    return next;
                                  })}
                                  style={{ ...buttonBase, background: "transparent", color: "#597356", fontSize: "10px" }}
                                >
                                  {expanded ? labels.collapse : labels.expand}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                aria-label="删除笔记"
                                title="删除笔记"
                                onClick={() => void deleteNote(note)}
                                style={{ ...buttonBase, background: "transparent", color: "#A66D67", fontSize: "10px" }}
                              >删除</button>
                              <button
                                type="button"
                                disabled={busy || editingNoteId !== null}
                                onClick={() => startEdit(note)}
                                style={{ ...buttonBase, background: "transparent", color: "#597356", fontSize: "10px" }}
                              >
                                {labels.edit}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
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
