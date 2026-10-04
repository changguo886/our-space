"use client";

import { Check, Circle, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
};

type SortableSubtaskRowProps = {
  subtask: TodoSubtask;
  index: number;
  busy: boolean;
  draggingDisabled: boolean;
  onToggle: (subtask: TodoSubtask) => void;
  onDelete: (subtask: TodoSubtask) => void;
};

/**
 * SortableSubtaskRow
 *
 * 单个可排序的 Subtask 行。
 *
 * 设计原则：
 * 1. 只有左侧的 01 / 02 / 03 编号区域是拖动把手，
 *    避免用户点击标题、完成按钮或未来的 Quick Notes 时误触拖动。
 * 2. 编号只根据当前 UI 顺序计算，不写进数据库。
 * 3. 未来 Task Companion 可以复用同一套排序逻辑与视觉语言。
 *
 * Quick Notes 暂时不直接写进这个组件：
 * 它应该是一张独立的 quick_notes 表，并通过 todo_id / subtask_id 关联。
 */
function SortableSubtaskRow({
  subtask,
  index,
  busy,
  draggingDisabled,
  onToggle,
  onDelete,
}: SortableSubtaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: subtask.id,
    disabled: draggingDisabled || subtask.id.startsWith("temp-"),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  const stepNumber = String(index + 1).padStart(2, "0");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-xl px-2 py-2 transition ${
        isDragging ? "bg-white shadow-md" : "hover:bg-white/70"
      }`}
    >
      {/*
       * 这里故意不用传统的六点 drag handle。
       * 01 / 02 / 03 本身就是顺序信息，同时承担拖动入口。
       * 后续如果要换成自定义 SVG / 品牌 icon，
       * 只需要替换这个按钮的视觉，不需要改排序逻辑。
       */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={draggingDisabled || subtask.id.startsWith("temp-")}
        className="flex h-7 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-[11px] font-medium tabular-nums text-ink-faint transition hover:bg-sage-50 hover:text-sage-700 active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
        aria-label={`拖动第 ${index + 1} 个步骤调整顺序`}
        title="拖动调整顺序"
      >
        {stepNumber}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(subtask)}
        className="shrink-0 text-sage-700 disabled:opacity-50"
        aria-label={subtask.completed ? "恢复步骤" : "完成步骤"}
      >
        {subtask.completed ? (
          <Check className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4 text-ink-faint" />
        )}
      </button>

      <p
        className={`min-w-0 flex-1 text-sm ${
          subtask.completed ? "text-ink-faint line-through" : "text-ink"
        }`}
      >
        {subtask.title}
      </p>

      {subtask.source === "ai" && (
        <span className="rounded-full bg-mist-50 px-2 py-0.5 text-[9px] text-mist-500">
          AI
        </span>
      )}

      {/*
       * Future Quick Notes slot:
       * 以后这里可以放一个很轻的 note icon，例如 MessageSquareText + note count。
       * 点击后在当前行下方展开 notes，不需要跳转页面，保持低摩擦。
       * 现在不放一个“不能用”的按钮，避免给用户制造死入口。
       */}

      <button
        type="button"
        onClick={() => onDelete(subtask)}
        disabled={busy}
        className="opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
        aria-label="删除步骤"
      >
        <Trash2 className="h-3.5 w-3.5 text-ink-faint hover:text-blush-500" />
      </button>
    </div>
  );
}

/**
 * TodoSubtasks
 *
 * 一个 Todo 对应的 checklist。
 *
 * 当前版本：
 * - 手动新增步骤
 * - 勾选完成 / 恢复
 * - 删除步骤
 * - 01 / 02 / 03 顺序编号
 * - 拖动重新排序
 * - 将新的 sort_order 保存到 Supabase
 *
 * 产品原则：
 * - 顺序只是当前组织方式，不代表必须按顺序完成。
 * - 用户在执行任务过程中可以随时新增、删除、重排步骤。
 * - AI 只负责在“计划/创建任务”阶段提供初始拆解；
 *   执行阶段依然以用户手动调整为主。
 *
 * Future Quick Notes：
 * - Quick Notes 不应该存进 todo_subtasks 表。
 * - 应该单独建立 quick_notes 表。
 * - 推荐同时保存 nullable todo_id 与 nullable subtask_id。
 * - 这样 Note 可以在 Global Inbox / Todo Inbox / 某个 Step 之间移动，
 *   而不需要删除重建。
 */
export default function TodoSubtasks({ todoId }: TodoSubtasksProps) {
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * PointerSensor 的 activationConstraint.distance = 6：
   * 鼠标需要移动一点距离后才进入拖动状态，减少误触。
   * KeyboardSensor 保留键盘可访问性。
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    void loadSubtasks();
  }, [todoId]);

  /** 从 Supabase 读取当前 Todo 的 checklist。 */
  async function loadSubtasks() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: loadError } = await supabase
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
      .eq("todo_id", todoId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    setLoading(false);

    if (loadError) {
      setError("读取任务清单失败：" + loadError.message);
      return;
    }

    setSubtasks(
      (data ?? []).map((item, index) => ({
        ...item,
        sort_order: index,
      }))
    );
  }

  /**
   * 手动新增一个 checklist item。
   * 用户在工作过程中临时意识到需要增加步骤时，直接新增即可。
   */
  async function addSubtask() {
    const cleanTitle = newTitle.trim();

    if (!cleanTitle || adding || reordering) return;

    setAdding(true);
    setError(null);

    const nextSortOrder = subtasks.length;
    const temporaryId = `temp-${crypto.randomUUID()}`;

    const optimisticItem: TodoSubtask = {
      id: temporaryId,
      todo_id: todoId,
      title: cleanTitle,
      completed: false,
      completed_at: null,
      sort_order: nextSortOrder,
      source: "manual",
      created_at: new Date().toISOString(),
    };

    setSubtasks((current) => [...current, optimisticItem]);
    setNewTitle("");

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("todo_subtasks")
      .insert({
        todo_id: todoId,
        title: cleanTitle,
        sort_order: nextSortOrder,
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

    setAdding(false);

    if (insertError || !data) {
      setSubtasks((current) =>
        current.filter((item) => item.id !== temporaryId)
      );
      setError("新增步骤失败：" + (insertError?.message ?? "没有返回数据"));
      return;
    }

    setSubtasks((current) =>
      current.map((item) => (item.id === temporaryId ? data : item))
    );
  }

  /**
   * 勾选 / 取消勾选一个子任务。
   * 完成只改变状态，不删除任何数据。
   */
  async function toggleSubtask(subtask: TodoSubtask) {
    if (busyId || reordering) return;

    const nextCompleted = !subtask.completed;
    const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;

    setBusyId(subtask.id);
    setSubtasks((current) =>
      current.map((item) =>
        item.id === subtask.id
          ? {
              ...item,
              completed: nextCompleted,
              completed_at: nextCompletedAt,
            }
          : item
      )
    );

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("todo_subtasks")
      .update({
        completed: nextCompleted,
        completed_at: nextCompletedAt,
      })
      .eq("id", subtask.id);

    setBusyId(null);

    if (updateError) {
      setSubtasks((current) =>
        current.map((item) => (item.id === subtask.id ? subtask : item))
      );
      setError("更新步骤失败：" + updateError.message);
    }
  }

  /**
   * 删除 checklist item。
   *
   * Quick Notes 接入后，建议：
   * - quick_notes.subtask_id -> ON DELETE SET NULL
   * - quick_notes.todo_id    -> ON DELETE SET NULL
   *
   * 这样删除 Step 时 Note 自动回到 Todo Inbox；
   * 删除 Todo 时 Note 自动进入 Global Unsorted Inbox，避免信息丢失。
   */
  async function deleteSubtask(subtask: TodoSubtask) {
    if (busyId || reordering) return;

    const previous = subtasks;
    setBusyId(subtask.id);

    const nextItems = previous
      .filter((item) => item.id !== subtask.id)
      .map((item, index) => ({ ...item, sort_order: index }));

    setSubtasks(nextItems);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("todo_subtasks")
      .delete()
      .eq("id", subtask.id);

    if (deleteError) {
      setBusyId(null);
      setSubtasks(previous);
      setError("删除步骤失败：" + deleteError.message);
      return;
    }

    const reorderResults = await Promise.all(
      nextItems.map((item, index) =>
        supabase
          .from("todo_subtasks")
          .update({ sort_order: index })
          .eq("id", item.id)
      )
    );

    setBusyId(null);

    const reorderError = reorderResults.find((result) => result.error)?.error;

    if (reorderError) {
      setError("步骤已删除，但重新整理顺序时出现问题：" + reorderError.message);
      void loadSubtasks();
    }
  }

  /**
   * 拖动结束后的排序处理。
   * 先在本地立即重排，再把新的 sort_order 保存到 Supabase。
   * 保存失败则恢复旧顺序。
   */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (
      !over ||
      active.id === over.id ||
      reordering ||
      busyId ||
      adding
    ) {
      return;
    }

    const oldIndex = subtasks.findIndex((item) => item.id === active.id);
    const newIndex = subtasks.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    const previous = subtasks;
    const reordered = arrayMove(previous, oldIndex, newIndex).map(
      (item, index) => ({ ...item, sort_order: index })
    );

    const changedItems = reordered.filter((item) => {
      const before = previous.find((previousItem) => previousItem.id === item.id);
      return before?.sort_order !== item.sort_order;
    });

    setSubtasks(reordered);
    setReordering(true);
    setError(null);

    const supabase = createClient();
    const results = await Promise.all(
      changedItems.map((item) =>
        supabase
          .from("todo_subtasks")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
      )
    );

    setReordering(false);

    const updateError = results.find((result) => result.error)?.error;

    if (updateError) {
      setSubtasks(previous);
      setError("保存步骤顺序失败：" + updateError.message);
    }
  }

  const completedCount = subtasks.filter((item) => item.completed).length;
  const sortableIds = useMemo(() => subtasks.map((item) => item.id), [subtasks]);

  return (
    <section className="rounded-2xl border border-line bg-paper/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">任务清单</h3>
          <p className="mt-1 text-xs text-ink-faint">
            {subtasks.length === 0
              ? "把大任务拆成几个更容易开始的小步骤。"
              : `${completedCount}/${subtasks.length} 已完成`}
          </p>
        </div>

        {subtasks.length > 0 && (
          <span className="rounded-full bg-sage-50 px-2.5 py-1 text-[10px] text-sage-700">
            {Math.round((completedCount / subtasks.length) * 100)}%
          </span>
        )}
      </div>

      <div className="mt-4">
        {loading && (
          <p className="text-xs text-ink-faint">正在读取清单…</p>
        )}

        {!loading && subtasks.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {subtasks.map((subtask, index) => (
                  <SortableSubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    index={index}
                    busy={busyId === subtask.id}
                    draggingDisabled={Boolean(busyId) || adding || reordering}
                    onToggle={toggleSubtask}
                    onDelete={deleteSubtask}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addSubtask();
            }
          }}
          placeholder="添加一个小步骤…"
          className="input min-w-0 flex-1"
        />

        <button
          type="button"
          disabled={adding || reordering || !newTitle.trim()}
          onClick={() => void addSubtask()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
          aria-label="添加步骤"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {reordering && (
        <p className="mt-2 text-[10px] text-ink-faint">正在保存新的步骤顺序…</p>
      )}

      {error && <p className="mt-3 text-xs text-blush-500">{error}</p>}

      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-faint"
        title="AI 拆分将在任务创建 / 规划阶段接入"
      >
        ✨ AI 帮我拆分
        <span className="ml-1 opacity-60">Coming later</span>
      </button>
    </section>
  );
}
