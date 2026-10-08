"use client";

import {
  Check,
  Circle,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";


/* =========================================================
   Types
========================================================= */

export type TodoSubtask = {
  id: string;
  todo_id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  source: "manual" | "ai";
  created_at: string;
};


type TodoSubtasksProps = {
  todoId: string;

  /*
   * 打开 Todo-level 快速笔记 Panel。
   *
   * null      -> 打开 Unsorted
   * UUID      -> 打开某个 Step 对应的 Notes section
   */
  onOpenNotes?: (
    subtaskId?: string | null
  ) => void;

  /*
   * 关键：把左侧最新的 subtasks 同步给父组件。
   *
   * 父组件会把这份 state 直接交给右侧 QuickNotes，
   * 所以新增 / 删除 / 排序后，右侧不需要等重新请求数据库。
   */
  onSubtasksChange?: (
    subtasks: TodoSubtask[]
  ) => void;
};


type SortableSubtaskRowProps = {
  subtask: TodoSubtask;
  index: number;
  busy: boolean;
  disabled: boolean;
  editing: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onStartEdit: (subtask: TodoSubtask) => void;
  onSaveEdit: (subtask: TodoSubtask) => void;
  onCancelEdit: () => void;
  onToggle: (subtask: TodoSubtask) => void;
  onDelete: (subtask: TodoSubtask) => void;
  onOpenNotes?: (subtaskId: string) => void;
};


/* =========================================================
   One sortable row
========================================================= */

function SortableSubtaskRow({
  subtask,
  index,
  busy,
  disabled,
  editing,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onDelete,
  onOpenNotes,
}: SortableSubtaskRowProps) {
  const { dictionary } = useI18n();
  const t = dictionary.todo.subtasks;
  const todoText = dictionary.todo;
  const common = dictionary.common;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: subtask.id,
    disabled:
      disabled ||
      subtask.id.startsWith("temp-"),
  });

  const style = {
    transform:
      CSS.Transform.toString(transform),
    transition,
    zIndex:
      isDragging ? 20 : undefined,
  };

  const stepNumber =
    String(index + 1).padStart(2, "0");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-xl px-2 py-2 transition ${
        isDragging
          ? "bg-white shadow-md"
          : "hover:bg-white/70"
      }`}
    >
      {/*
       * 左边的编号同时作为 drag handle。
       */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={
          disabled ||
          subtask.id.startsWith("temp-")
        }
        className="flex h-7 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-[11px] font-medium tabular-nums text-ink-faint transition hover:bg-sage-50 hover:text-sage-700 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        aria-label={t.dragStep.replace("{index}", String(index + 1))}
        title={t.reorder}
      >
        {stepNumber}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onToggle(subtask)
        }
        className="shrink-0 text-sage-700 disabled:opacity-50"
        aria-label={
          subtask.completed
            ? t.restore
            : t.complete
        }
      >
        {subtask.completed ? (
          <Check className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4 text-ink-faint" />
        )}
      </button>

      {editing ? (
        <input
          value={editTitle}
          onChange={(event) =>
            onEditTitleChange(
              event.target.value
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSaveEdit(subtask);
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCancelEdit();
            }
          }}
          className="input h-8 min-w-0 flex-1 px-2 text-sm"
          aria-label={t.editName}
          autoFocus
        />
      ) : (
        <p
          className={`min-w-0 flex-1 text-sm ${
            subtask.completed
              ? "text-ink-faint line-through"
              : "text-ink"
          }`}
        >
          {subtask.title}
        </p>
      )}

      {!editing &&
        subtask.source === "ai" && (
        <span className="rounded-full bg-mist-50 px-2 py-0.5 text-[9px] text-mist-500">
          AI
        </span>
      )}

      {editing ? (
        <>
          <button
            type="button"
            onClick={() =>
              onSaveEdit(subtask)
            }
            disabled={
              busy ||
              !editTitle.trim()
            }
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sage-700 transition hover:bg-sage-50 disabled:opacity-40"
            aria-label={t.saveStep}
            title={common.save}
          >
            <Save className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onCancelEdit}
            disabled={busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition hover:bg-paper hover:text-ink-soft disabled:opacity-40"
            aria-label={t.cancelEdit}
            title={common.cancel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() =>
              onStartEdit(subtask)
            }
            disabled={
              busy ||
              subtask.id.startsWith("temp-")
            }
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-70 transition hover:bg-sage-50 hover:text-sage-700 group-hover:opacity-100 disabled:opacity-30"
            aria-label={t.editStep}
            title={t.editStep}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/*
           * 这里只发出“打开右侧 Notes”的事件，
           * TodoSubtasks 自己不再 render QuickNotes。
           */}
          <button
            type="button"
            onClick={() =>
              onOpenNotes?.(subtask.id)
            }
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
            aria-label={t.openStepNotes}
            title={todoText.quickNotes}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              onDelete(subtask)
            }
            disabled={busy}
            className="opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
            aria-label={t.deleteStep}
            title={t.deleteStep}
          >
            <Trash2 className="h-3.5 w-3.5 text-ink-faint hover:text-blush-500" />
          </button>
        </>
      )}
    </div>
  );
}


/* =========================================================
   Main component
========================================================= */

export default function TodoSubtasks({
  todoId,
  onOpenNotes,
  onSubtasksChange,
}: TodoSubtasksProps) {
  const { dictionary } = useI18n();
  const t = dictionary.todo.subtasks;
  const todoText = dictionary.todo;

  const [
    subtasks,
    setSubtasks,
  ] = useState<TodoSubtask[]>([]);

  const [
    newTitle,
    setNewTitle,
  ] = useState("");

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(
    null
  );

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busyId,
    setBusyId,
  ] = useState<string | null>(null);

  const [
    adding,
    setAdding,
  ] = useState(false);

  const [
    reordering,
    setReordering,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);


  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint: {
            distance: 6,
          },
        }
      ),

      useSensor(
        KeyboardSensor,
        {
          coordinateGetter:
            sortableKeyboardCoordinates,
        }
      )
    );


  /* =======================================================
     Load subtasks when Todo changes
  ======================================================= */

  useEffect(() => {
    void loadSubtasks();
  }, [todoId]);


  /* =======================================================
     LIVE SYNC TO PARENT

     这是这次修改最重要的部分。

     左侧每次发生：
     - 新增
     - 删除
     - 排序
     - 完成状态变化

     都会把最新 state 交给父级。

     临时 temp-* 项目不传给右侧，避免 QuickNotes
     在数据库真正创建 subtask 前拿到无效 FK。
  ======================================================= */

  useEffect(() => {
    const stableSubtasks =
      subtasks.filter(
        (item) =>
          !item.id.startsWith("temp-")
      );

    onSubtasksChange?.(
      stableSubtasks
    );
  }, [
    subtasks,
    onSubtasksChange,
  ]);


  async function loadSubtasks() {
    setLoading(true);
    setError(null);

    try {
      const supabase =
        createClient();

      const {
        data,
        error: loadError,
      } =
        await supabase
          .from("todo_subtasks")
          .select(`
            id,
            todo_id,
            title,
            completed,
            completed_at,
            sort_order,
            source,
            created_at
          `)
          .eq(
            "todo_id",
            todoId
          )
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

      if (loadError) {
        setError(
          t.loadFailed +
            loadError.message
        );

        return;
      }

      setSubtasks(
        (data ?? []) as TodoSubtask[]
      );
    } catch (unknownError) {
      setError(
        t.loadFailedShort
      );
    } finally {
      setLoading(false);
    }
  }


  /* =======================================================
     Add
  ======================================================= */

  async function addSubtask() {
    const cleanTitle =
      newTitle.trim();

    if (
      !cleanTitle ||
      adding ||
      reordering
    ) {
      return;
    }

    setAdding(true);
    setError(null);

    const nextSortOrder =
      subtasks.length;

    const temporaryId =
      `temp-${crypto.randomUUID()}`;

    const optimisticItem:
      TodoSubtask = {
        id: temporaryId,
        todo_id: todoId,
        title: cleanTitle,
        completed: false,
        completed_at: null,
        sort_order: nextSortOrder,
        source: "manual",
        created_at:
          new Date().toISOString(),
      };

    setSubtasks(
      (current) => [
        ...current,
        optimisticItem,
      ]
    );

    setNewTitle("");

    try {
      const supabase =
        createClient();

      const {
        data,
        error: insertError,
      } =
        await supabase
          .from("todo_subtasks")
          .insert({
            todo_id: todoId,
            title: cleanTitle,
            sort_order:
              nextSortOrder,
            source: "manual",
          })
          .select(`
            id,
            todo_id,
            title,
            completed,
            completed_at,
            sort_order,
            source,
            created_at
          `)
          .single();

      if (
        insertError ||
        !data
      ) {
        setSubtasks(
          (current) =>
            current.filter(
              (item) =>
                item.id !==
                temporaryId
            )
        );

        setError(
          t.addFailed +
            (
              insertError?.message ??
              t.missingData
            )
        );

        return;
      }

      /*
       * 把 temp id 替换成数据库真实 UUID。
       * 这个 state 更新后，父级和右侧 QuickNotes 会马上收到新 Step。
       */
      setSubtasks(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              temporaryId
                ? data as TodoSubtask
                : item
          )
      );
    } catch {
      setSubtasks(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              temporaryId
          )
      );

      setError(
        t.addFailedShort
      );
    } finally {
      setAdding(false);
    }
  }


  /* =======================================================
     Edit title

     Todo / Today / Calendar / Mini Focus 都共享同一张
     todo_subtasks 表，所以这里修改后所有入口都会读到同一结果。

     键盘：
     - Enter  保存
     - Escape 取消
  ======================================================= */

  function startEditingSubtask(
    subtask: TodoSubtask
  ) {
    if (
      busyId ||
      adding ||
      reordering ||
      subtask.id.startsWith("temp-")
    ) {
      return;
    }

    setEditingId(
      subtask.id
    );

    setEditTitle(
      subtask.title
    );

    setError(null);
  }


  function cancelEditingSubtask() {
    setEditingId(null);
    setEditTitle("");
  }


  async function saveSubtaskTitle(
    subtask: TodoSubtask
  ) {
    const cleanTitle =
      editTitle.trim();

    if (
      !cleanTitle ||
      busyId ||
      adding ||
      reordering
    ) {
      return;
    }

    if (
      cleanTitle ===
      subtask.title
    ) {
      cancelEditingSubtask();
      return;
    }

    const previousTitle =
      subtask.title;

    setBusyId(
      subtask.id
    );

    setError(null);

    /*
     * Optimistic update：
     * 父级 TodayTodoWorkspace 会立即把新标题同步给 QuickNotes。
     */
    setSubtasks(
      (current) =>
        current.map(
          (item) =>
            item.id === subtask.id
              ? {
                  ...item,
                  title:
                    cleanTitle,
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
            title:
              cleanTitle,
          })
          .eq(
            "id",
            subtask.id
          );

      if (
        updateError
      ) {
        setSubtasks(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                subtask.id
                  ? {
                      ...item,
                      title:
                        previousTitle,
                    }
                  : item
            )
        );

        setError(
          t.editFailed +
            updateError.message
        );

        return;
      }

      cancelEditingSubtask();
    } catch {
      setSubtasks(
        (current) =>
          current.map(
            (item) =>
              item.id ===
                subtask.id
                ? {
                    ...item,
                    title:
                      previousTitle,
                  }
                : item
          )
      );

      setError(
        t.editFailedShort
      );
    } finally {
      setBusyId(null);
    }
  }


  /* =======================================================
     Complete / restore
  ======================================================= */

  async function toggleSubtask(
    subtask: TodoSubtask
  ) {
    if (
      busyId ||
      reordering
    ) {
      return;
    }

    const nextCompleted =
      !subtask.completed;

    const nextCompletedAt =
      nextCompleted
        ? new Date().toISOString()
        : null;

    setBusyId(subtask.id);

    setSubtasks(
      (current) =>
        current.map(
          (item) =>
            item.id === subtask.id
              ? {
                  ...item,
                  completed:
                    nextCompleted,
                  completed_at:
                    nextCompletedAt,
                }
              : item
        )
    );

    try {
      const supabase =
        createClient();

      const {
        error: updateError,
      } =
        await supabase
          .from("todo_subtasks")
          .update({
            completed:
              nextCompleted,
            completed_at:
              nextCompletedAt,
          })
          .eq(
            "id",
            subtask.id
          );

      if (updateError) {
        setSubtasks(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                subtask.id
                  ? subtask
                  : item
            )
        );

        setError(
          t.updateFailed +
            updateError.message
        );
      }
    } catch {
      setSubtasks(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              subtask.id
                ? subtask
                : item
          )
      );

      setError(
        t.updateFailedShort
      );
    } finally {
      setBusyId(null);
    }
  }


  /* =======================================================
     Delete

     quick_notes.subtask_id 使用 ON DELETE SET NULL。
     因此数据库删除 Step 后，原 Step Notes 会变成 Unsorted。
  ======================================================= */

  async function deleteSubtask(
    subtask: TodoSubtask
  ) {
    if (
      busyId ||
      reordering
    ) {
      return;
    }

    const previous =
      subtasks;

    setBusyId(
      subtask.id
    );

    /*
     * Optimistic delete：左侧立刻消失。
     * 父级也会立刻把这个变化传给右侧。
     */
    setSubtasks(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            subtask.id
        )
    );

    try {
      const supabase =
        createClient();

      const {
        error: deleteError,
      } =
        await supabase
          .from("todo_subtasks")
          .delete()
          .eq(
            "id",
            subtask.id
          );

      if (deleteError) {
        setSubtasks(previous);

        setError(
          t.deleteFailed +
            deleteError.message
        );
      }
    } catch {
      setSubtasks(previous);

      setError(
        t.deleteFailedShort
      );
    } finally {
      setBusyId(null);
    }
  }


  /* =======================================================
     Drag reorder
  ======================================================= */

  async function handleDragEnd(
    event: DragEndEvent
  ) {
    const {
      active,
      over,
    } = event;

    if (
      !over ||
      active.id === over.id ||
      reordering ||
      busyId ||
      adding ||
      editingId
    ) {
      return;
    }

    const oldIndex =
      subtasks.findIndex(
        (item) =>
          item.id === active.id
      );

    const newIndex =
      subtasks.findIndex(
        (item) =>
          item.id === over.id
      );

    if (
      oldIndex < 0 ||
      newIndex < 0
    ) {
      return;
    }

    const previous =
      subtasks;

    const reordered =
      arrayMove(
        previous,
        oldIndex,
        newIndex
      ).map(
        (item, index) => ({
          ...item,
          sort_order: index,
        })
      );

    /*
     * 先更新 React state。
     * 这一步会让右侧 QuickNotes section 顺序立即同步。
     */
    setSubtasks(
      reordered
    );

    setReordering(true);
    setError(null);

    try {
      const supabase =
        createClient();

      const results =
        await Promise.all(
          reordered.map(
            (item) =>
              supabase
                .from(
                  "todo_subtasks"
                )
                .update({
                  sort_order:
                    item.sort_order,
                })
                .eq(
                  "id",
                  item.id
                )
          )
        );

      const updateError =
        results.find(
          (result) =>
            result.error
        )?.error;

      if (updateError) {
        setSubtasks(previous);

        setError(
          t.saveOrderFailed +
            updateError.message
        );
      }
    } catch {
      setSubtasks(previous);

      setError(
        t.saveOrderFailedShort
      );
    } finally {
      setReordering(false);
    }
  }


  const completedCount =
    subtasks.filter(
      (item) =>
        item.completed
    ).length;


  const sortableIds =
    useMemo(
      () =>
        subtasks.map(
          (item) =>
            item.id
        ),
      [subtasks]
    );


  return (
    <section className="rounded-2xl border border-line bg-paper/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">
            {t.title}
          </h3>

          <p className="mt-1 text-xs text-ink-faint">
            {subtasks.length === 0
              ? t.empty
              : t.completedCount
                  .replace("{done}", String(completedCount))
                  .replace("{total}", String(subtasks.length))}
          </p>
        </div>

        {subtasks.length > 0 && (
          <span className="rounded-full bg-sage-50 px-2.5 py-1 text-[10px] text-sage-700">
            {Math.round(
              (
                completedCount /
                subtasks.length
              ) * 100
            )}
            %
          </span>
        )}
      </div>


      <div className="mt-4">
        {loading && (
          <p className="text-xs text-ink-faint">
            {t.loading}
          </p>
        )}

        {!loading &&
          subtasks.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={
              closestCenter
            }
            onDragEnd={
              handleDragEnd
            }
          >
            <SortableContext
              items={sortableIds}
              strategy={
                verticalListSortingStrategy
              }
            >
              <div className="space-y-2">
                {subtasks.map(
                  (
                    subtask,
                    index
                  ) => (
                    <SortableSubtaskRow
                      key={subtask.id}
                      subtask={subtask}
                      index={index}
                      busy={
                        busyId ===
                        subtask.id
                      }
                      disabled={
                        Boolean(busyId) ||
                        Boolean(editingId) ||
                        adding ||
                        reordering
                      }
                      editing={
                        editingId ===
                        subtask.id
                      }
                      editTitle={
                        editTitle
                      }
                      onEditTitleChange={
                        setEditTitle
                      }
                      onStartEdit={
                        startEditingSubtask
                      }
                      onSaveEdit={
                        saveSubtaskTitle
                      }
                      onCancelEdit={
                        cancelEditingSubtask
                      }
                      onToggle={
                        toggleSubtask
                      }
                      onDelete={
                        deleteSubtask
                      }
                      onOpenNotes={
                        (subtaskId) =>
                          onOpenNotes?.(
                            subtaskId
                          )
                      }
                    />
                  )
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>


      {/* Add a new Step */}
      <div className="mt-4 flex gap-2">
        <input
          value={newTitle}
          onChange={(event) =>
            setNewTitle(
              event.target.value
            )
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter"
            ) {
              event.preventDefault();
              void addSubtask();
            }

            if (
              event.key === "Escape"
            ) {
              setNewTitle("");
            }
          }}
          placeholder={t.addPlaceholder}
          className="input min-w-0 flex-1"
          disabled={
            Boolean(editingId)
          }
        />

        <button
          type="button"
          disabled={
            adding ||
            reordering ||
            Boolean(editingId) ||
            !newTitle.trim()
          }
          onClick={() =>
            void addSubtask()
          }
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
          aria-label={t.add}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>


      {/* Todo-level Notes entry */}
      <div className="mt-4 border-t border-line/70 pt-4">
        <button
          type="button"
          onClick={() =>
            onOpenNotes?.(null)
          }
          className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/60"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
            <MessageSquareText className="h-4 w-4 text-sage-700" />
            {todoText.quickNotes}
          </span>

          <span className="text-[10px] text-ink-faint">
            {todoText.openPanel}
          </span>
        </button>
      </div>


      {reordering && (
        <p className="mt-2 text-[10px] text-ink-faint">
          {t.saveOrder}
        </p>
      )}


      {error && (
        <p className="mt-3 text-xs text-blush-500">
          {error}
        </p>
      )}


      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-faint"
        title={t.aiTitle}
      >
        ✨ {t.aiSplit}
        <span className="ml-1 opacity-60">
          {t.aiLater}
        </span>
      </button>
    </section>
  );
}
