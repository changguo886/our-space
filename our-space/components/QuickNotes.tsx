"use client";

import {
  MessageSquareText,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
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
   * null = 当前 Todo 的 Unsorted Quick Notes
   * string = 某个具体 Subtask 的 Quick Notes
   */
  subtaskId?: string | null;

  /*
   * 用于不同场景的提示文字。
   * Task Companion 后续可以传更短的 placeholder。
   */
  placeholder?: string;
};


/**
 * QuickNotes
 *
 * 一个可复用的 Quick Notes 小组件。
 *
 * 当前职责：
 * - 读取当前 Todo / Subtask 下的 Notes
 * - 新增 Note
 * - 删除 Note
 *
 * 数据关系：
 * - todo_id 有值 + subtask_id 有值
 *   => 属于某个具体 Step
 *
 * - todo_id 有值 + subtask_id = null
 *   => 属于当前 Todo 的 Unsorted Notes
 *
 * 注意：
 * - 完成 Todo / Subtask 不会删除 Note。
 * - 删除 Subtask 时，数据库 ON DELETE SET NULL 会让 Note
 *   自动回到当前 Todo 的 Unsorted Notes。
 * - 删除 Todo 时，todo_id 会 SET NULL，未来可进入 Global Inbox。
 *
 * 后续：
 * - Note drag & drop
 * - Step -> Step
 * - Step -> Todo Unsorted
 * - Todo Unsorted -> Global Inbox
 */
export default function QuickNotes({
  todoId,
  subtaskId = null,
  placeholder,
}: QuickNotesProps) {
  const [
    notes,
    setNotes,
  ] =
    useState<QuickNote[]>(
      []
    );

  const [
    draft,
    setDraft,
  ] =
    useState("");

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
    deletingId,
    setDeletingId,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );


  useEffect(() => {
    void loadNotes();
  }, [
    todoId,
    subtaskId,
  ]);


  /**
   * 读取当前上下文的 Quick Notes。
   *
   * 如果 subtaskId 有值，就只读取该 Step 的 Notes。
   * 如果 subtaskId 为 null，就读取当前 Todo 的 Unsorted Notes。
   */
  async function loadNotes() {
    setLoading(true);
    setError(null);

    const supabase =
      createClient();

    let query =
      supabase
        .from(
          "quick_notes"
        )
        .select(`
          id,
          todo_id,
          subtask_id,
          content,
          sort_order,
          created_at,
          updated_at
        `)
        .eq(
          "todo_id",
          todoId
        );

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
      error:
        loadError,
    } =
      await query
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
        );

    setLoading(false);

    if (loadError) {
      setError(
        "读取 Quick Notes 失败：" +
          loadError.message
      );
      return;
    }

    setNotes(
      data ?? []
    );
  }


  /**
   * 新增 Quick Note。
   *
   * user_id 不需要前端传入；
   * 数据库会用 default auth.uid() 自动填充。
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
        id:
          temporaryId,

        todo_id:
          todoId,

        subtask_id:
          subtaskId,

        content:
          cleanContent,

        sort_order:
          notes.length,

        created_at:
          new Date()
            .toISOString(),

        updated_at:
          new Date()
            .toISOString(),
      };

    /*
     * Optimistic UI：
     * 用户按 Enter 后立即看到 Note，
     * 不等待网络返回。
     */
    setNotes(
      (
        current
      ) => [
        ...current,
        optimisticNote,
      ]
    );

    setDraft("");

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
            subtaskId,

          content:
            cleanContent,

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

      setError(
        "新增 Quick Note 失败：" +
          (
            insertError
              ?.message ??
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
   * 真正删除一条 Quick Note。
   *
   * 只有用户明确点击 Note 的删除按钮才会走这里。
   * 删除 Todo / Subtask 不会调用这个函数。
   */
  async function deleteNote(
    note:
      QuickNote
  ) {
    if (
      deletingId
    ) {
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
      error:
        deleteError,
    } =
      await supabase
        .from(
          "quick_notes"
        )
        .delete()
        .eq(
          "id",
          note.id
        );

    setDeletingId(
      null
    );

    if (
      deleteError
    ) {
      setNotes(
        previous
      );

      setError(
        "删除 Quick Note 失败：" +
          deleteError.message
      );
    }
  }


  const inputPlaceholder =
    placeholder ??
    (
      subtaskId
        ? "为这个步骤记一条 Quick Note…"
        : "记一条尚未归类的 Quick Note…"
    );


  return (
    <div className="rounded-xl border border-line/70 bg-white/55 p-3">
      {loading ? (
        <p className="text-xs text-ink-faint">
          正在读取 Quick Notes…
        </p>
      ) : (
        <>
          {notes.length >
            0 && (
            <div className="mb-3 space-y-2">
              {notes.map(
                (
                  note
                ) => (
                  <div
                    key={
                      note.id
                    }
                    className="group flex items-start gap-2 rounded-lg bg-paper/70 px-3 py-2"
                  >
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage-700/70" />

                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-5 text-ink-soft">
                      {
                        note.content
                      }
                    </p>

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
                      className="shrink-0 opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                      aria-label="删除 Quick Note"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-ink-faint hover:text-blush-500" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={
                draft
              }
              onChange={(
                event
              ) =>
                setDraft(
                  event
                    .target
                    .value
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  event.preventDefault();

                  void addNote();
                }
              }}
              placeholder={
                inputPlaceholder
              }
              className="input min-w-0 flex-1"
            />

            <button
              type="button"
              disabled={
                busy ||
                !draft.trim()
              }
              onClick={() =>
                void addNote()
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
              aria-label="添加 Quick Note"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-2 text-xs text-blush-500">
          {error}
        </p>
      )}
    </div>
  );
}
