"use client";

import {
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";


export type QuickNote = {
  id: string;
  todo_id: string | null;
  subtask_id: string | null;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};


type QuickNotesProps = {
  todoId: string;

  /*
   * null = 当前 Todo 的 Task Notes
   * string = 某个具体 Subtask 的 Notes
   */
  subtaskId?: string | null;

  /*
   * 不同页面可以传更合适的提示文字。
   */
  placeholder?: string;

  /*
   * 紧凑模式：
   * 后续 Task Companion 可以复用。
   */
  compact?: boolean;
};


/**
 * QuickNotes
 *
 * 视觉目标：
 * - 更像“附在任务上的纸张/工作草稿”
 * - 不像聊天区或留言板
 * - 默认阅读很轻，不让长内容撑爆页面
 *
 * 交互：
 * - 每条 Note 默认最多显示 2 行
 * - 长内容可 More / Less
 * - 点击 + Add note 后展开 textarea
 * - 普通 Enter 换行
 * - Ctrl/Cmd + Enter 保存
 *
 * 数据：
 * - todo_id = 当前 Todo
 * - subtask_id = 当前 Step 或 null
 */
export default function QuickNotes({
  todoId,
  subtaskId = null,
  placeholder,
  compact = false,
}: QuickNotesProps) {
  const [notes, setNotes] =
    useState<QuickNote[]>([]);

  const [draft, setDraft] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [composerOpen, setComposerOpen] =
    useState(false);

  const [expandedIds, setExpandedIds] =
    useState<Set<string>>(
      new Set()
    );

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );


  useEffect(() => {
    void loadNotes();
  }, [todoId, subtaskId]);


  useEffect(() => {
    if (
      composerOpen &&
      textareaRef.current
    ) {
      textareaRef.current.focus();
    }
  }, [composerOpen]);


  /**
   * 读取当前 Todo / Subtask 下的 Notes。
   */
  async function loadNotes() {
    setLoading(true);
    setError(null);

    const supabase =
      createClient();

    let query =
      supabase
        .from("quick_notes")
        .select(`
          id,
          todo_id,
          subtask_id,
          content,
          sort_order,
          created_at,
          updated_at
        `)
        .eq("todo_id", todoId);

    if (subtaskId) {
      query =
        query.eq(
          "subtask_id",
          subtaskId
        );
    } else {
      query =
        query.is(
          "subtask_id",
          null
        );
    }

    const {
      data,
      error: loadError,
    } =
      await query
        .order(
          "sort_order",
          {
            ascending: true,
          }
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    setLoading(false);

    if (loadError) {
      setError(
        "读取 Quick Notes 失败：" +
          loadError.message
      );
      return;
    }

    setNotes(data ?? []);
  }


  /**
   * 新增 Quick Note。
   *
   * user_id 由数据库 default auth.uid()
   * 自动补齐。
   */
  async function addNote() {
    const cleanContent =
      draft.trim();

    if (
      !cleanContent ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    const temporaryId =
      `temp-note-${crypto.randomUUID()}`;

    const optimisticNote:
      QuickNote = {
        id: temporaryId,
        todo_id: todoId,
        subtask_id: subtaskId,
        content: cleanContent,
        sort_order: notes.length,
        created_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      };

    setNotes(
      (
        current
      ) => [
        ...current,
        optimisticNote,
      ]
    );

    setDraft("");
    setComposerOpen(false);

    const supabase =
      createClient();

    const {
      data,
      error: insertError,
    } =
      await supabase
        .from("quick_notes")
        .insert({
          todo_id: todoId,
          subtask_id: subtaskId,
          content: cleanContent,
          sort_order:
            notes.length,
        })
        .select(`
          id,
          todo_id,
          subtask_id,
          content,
          sort_order,
          created_at,
          updated_at
        `)
        .single();

    setBusy(false);

    if (
      insertError ||
      !data
    ) {
      setNotes(
        (
          current
        ) =>
          current.filter(
            (
              note
            ) =>
              note.id !==
              temporaryId
          )
      );

      setDraft(
        cleanContent
      );

      setComposerOpen(
        true
      );

      setError(
        "新增 Quick Note 失败：" +
          (
            insertError?.message ??
            "没有返回数据"
          )
      );

      return;
    }

    setNotes(
      (
        current
      ) =>
        current.map(
          (
            note
          ) =>
            note.id ===
            temporaryId
              ? data
              : note
        )
    );
  }


  /**
   * 只有明确点删除 Note 时才真正删除内容。
   */
  async function deleteNote(
    note: QuickNote
  ) {
    if (deletingId) {
      return;
    }

    const previous =
      notes;

    setDeletingId(
      note.id
    );

    setNotes(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            note.id
        )
    );

    const supabase =
      createClient();

    const {
      error: deleteError,
    } =
      await supabase
        .from("quick_notes")
        .delete()
        .eq("id", note.id);

    setDeletingId(null);

    if (deleteError) {
      setNotes(previous);

      setError(
        "删除 Quick Note 失败：" +
          deleteError.message
      );
    }
  }


  /**
   * 切换某条 Note 的完整/折叠阅读状态。
   */
  function toggleExpanded(
    noteId: string
  ) {
    setExpandedIds(
      (
        current
      ) => {
        const next =
          new Set(current);

        if (
          next.has(noteId)
        ) {
          next.delete(noteId);
        } else {
          next.add(noteId);
        }

        return next;
      }
    );
  }


  /**
   * textarea 最多自动长到约 3 行。
   * 更长内容继续在输入框内部滚动。
   */
  function resizeTextarea(
    element:
      HTMLTextAreaElement
  ) {
    element.style.height =
      "auto";

    const maxHeight =
      compact
        ? 84
        : 96;

    element.style.height =
      `${Math.min(
        element.scrollHeight,
        maxHeight
      )}px`;

    element.style.overflowY =
      element.scrollHeight >
      maxHeight
        ? "auto"
        : "hidden";
  }


  const inputPlaceholder =
    placeholder ??
    (
      subtaskId
        ? "Add a quick note for this step..."
        : "Add a task note..."
    );


  const noteLabel =
    useMemo(
      () =>
        subtaskId
          ? "Quick notes"
          : "Task notes",
      [subtaskId]
    );


  return (
    <div
      className={`rounded-2xl border border-line/70 bg-white/45 ${
        compact
          ? "px-3 py-3"
          : "px-4 py-4"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            {/*
             * 纸张视觉：
             * 一张主纸 + 一张轻微偏移的底纸，
             * 用来建立“notes / paper stack”的视觉语言。
             */}
            {notes.length > 1 && (
              <FileText className="absolute left-[7px] top-[4px] h-4 w-4 translate-x-1 translate-y-1 text-ink-faint/35" />
            )}

            <FileText className="relative h-4 w-4 text-sage-700" />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-soft">
              {noteLabel}
              {notes.length > 0 && (
                <span className="ml-1.5 text-ink-faint">
                  · {notes.length}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>


      {loading ? (
        <p className="text-xs text-ink-faint">
          正在读取 Notes…
        </p>
      ) : (
        <>
          {notes.length > 0 && (
            <div className="space-y-1">
              {notes.map(
                (
                  note,
                  index
                ) => {
                  const expanded =
                    expandedIds.has(
                      note.id
                    );

                  const isLong =
                    note.content.length >
                    120 ||
                    note.content.includes(
                      "\n"
                    );

                  return (
                    <div
                      key={note.id}
                      className="group relative rounded-xl px-2 py-2 transition hover:bg-paper/45"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-300" />

                        <div className="min-w-0 flex-1">
                          <p
                            className={`whitespace-pre-wrap text-xs leading-5 text-ink-soft ${
                              expanded
                                ? ""
                                : "line-clamp-2"
                            }`}
                          >
                            {
                              note.content
                            }
                          </p>

                          {isLong && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleExpanded(
                                  note.id
                                )
                              }
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-sage-700 hover:text-sage-800"
                            >
                              {expanded
                                ? "Less"
                                : "More"}

                              {expanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={
                            deletingId ===
                            note.id
                          }
                          onClick={() =>
                            void deleteNote(
                              note
                            )
                          }
                          className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                          aria-label="删除 Quick Note"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-ink-faint hover:text-blush-500" />
                        </button>
                      </div>

                      {index <
                        notes.length -
                          1 && (
                        <div className="ml-4 mt-2 border-b border-line/50" />
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}


          {!composerOpen ? (
            <button
              type="button"
              onClick={() =>
                setComposerOpen(
                  true
                )
              }
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-ink-faint transition hover:bg-paper/55 hover:text-sage-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add note
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-line bg-paper/55 p-3 shadow-sm">
              <textarea
                ref={
                  textareaRef
                }
                value={
                  draft
                }
                onChange={(
                  event
                ) => {
                  setDraft(
                    event.target
                      .value
                  );

                  resizeTextarea(
                    event.target
                  );
                }}
                onInput={(
                  event
                ) =>
                  resizeTextarea(
                    event.currentTarget
                  )
                }
                onKeyDown={(
                  event
                ) => {
                  const saveShortcut =
                    (
                      event.ctrlKey ||
                      event.metaKey
                    ) &&
                    event.key ===
                      "Enter";

                  if (
                    saveShortcut
                  ) {
                    event.preventDefault();
                    void addNote();
                  }

                  if (
                    event.key ===
                      "Escape" &&
                    !draft.trim()
                  ) {
                    setComposerOpen(
                      false
                    );
                  }
                }}
                rows={1}
                placeholder={
                  inputPlaceholder
                }
                className="w-full resize-none bg-transparent text-xs leading-5 text-ink outline-none placeholder:text-ink-faint"
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-ink-faint">
                  Ctrl/Cmd + Enter to save
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(
                        false
                      );
                      setDraft("");
                    }}
                    className="rounded-lg px-2 py-1 text-[10px] text-ink-faint transition hover:bg-white hover:text-ink-soft"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      !draft.trim()
                    }
                    onClick={() =>
                      void addNote()
                    }
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sage-100 px-2.5 text-[10px] font-medium text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}


      {error && (
        <p className="mt-3 text-xs text-blush-500">
          {error}
        </p>
      )}
    </div>
  );
}
