"use client";

import {
  Check,
  Circle,
  Plus,
  Trash2,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";


export type TodoSubtask = {
  id: string;

  todo_id: string;

  title: string;

  completed: boolean;

  completed_at:
    | string
    | null;

  sort_order: number;

  source:
    | "manual"
    | "ai";

  created_at: string;
};


type TodoSubtasksProps = {
  todoId: string;
};


/**
 * TodoSubtasks
 *
 * 一个 Todo 对应的 checklist。
 *
 * 当前版本：
 * - 手动新增
 * - 勾选完成 / 恢复
 * - 删除
 *
 * 后续 AI 拆分不会改变这个组件的数据结构，
 * AI 只需要往 todo_subtasks 表批量 INSERT 即可。
 */
export default function TodoSubtasks({
  todoId,
}: TodoSubtasksProps) {
  const [
    subtasks,
    setSubtasks,
  ] =
    useState<TodoSubtask[]>(
      []
    );

  const [
    newTitle,
    setNewTitle,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    busyId,
    setBusyId,
  ] =
    useState<string | null>(
      null
    );

  const [
    adding,
    setAdding,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );


  /**
   * 读取当前 Todo 的全部子任务。
   *
   * 排序规则：
   * 先按 sort_order，
   * 再按 created_at。
   */
  useEffect(() => {
    void loadSubtasks();
  }, [todoId]);


  /**
   * 从 Supabase 读取 checklist。
   */
  async function loadSubtasks() {
    setLoading(true);
    setError(null);

    const supabase =
      createClient();

    const {
      data,
      error:
        loadError,
    } =
      await supabase
        .from(
          "todo_subtasks"
        )
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
        "读取任务清单失败：" +
          loadError.message
      );

      return;
    }

    setSubtasks(
      data ?? []
    );
  }


  /**
   * 手动新增一个 checklist item。
   *
   * source 固定写 manual。
   * 以后 AI 拆分会复用同一张表，
   * 只是 source 改成 ai。
   */
  async function addSubtask() {
    const cleanTitle =
      newTitle.trim();

    if (
      !cleanTitle ||
      adding
    ) {
      return;
    }

    setAdding(true);
    setError(null);

    const temporaryId =
      `temp-${crypto.randomUUID()}`;

    const optimisticItem:
      TodoSubtask = {
        id:
          temporaryId,

        todo_id:
          todoId,

        title:
          cleanTitle,

        completed:
          false,

        completed_at:
          null,

        sort_order:
          subtasks.length,

        source:
          "manual",

        created_at:
          new Date()
            .toISOString(),
      };

    /*
     * Optimistic UI：
     * 先立刻显示，
     * 不等待 Supabase。
     */
    setSubtasks(
      (
        current
      ) => [
        ...current,
        optimisticItem,
      ]
    );

    setNewTitle("");

    const supabase =
      createClient();

    const {
      data,
      error:
        insertError,
    } =
      await supabase
        .from(
          "todo_subtasks"
        )
        .insert({
          todo_id:
            todoId,

          title:
            cleanTitle,

          sort_order:
            subtasks.length,

          source:
            "manual",
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

    if (
      insertError ||
      !data
    ) {
      /*
       * 写入失败则回滚 optimistic item。
       */
      setSubtasks(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              item.id !==
              temporaryId
          )
      );

      setError(
        "新增步骤失败：" +
          (
            insertError
              ?.message ??
            "没有返回数据"
          )
      );

      return;
    }

    /*
     * 用数据库真实 ID
     * 替换临时 ID。
     */
    setSubtasks(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            temporaryId
              ? data
              : item
        )
    );
  }


  /**
   * 勾选 / 取消勾选一个子任务。
   */
  async function toggleSubtask(
    subtask:
      TodoSubtask
  ) {
    if (
      busyId
    ) {
      return;
    }

    const nextCompleted =
      !subtask.completed;

    const nextCompletedAt =
      nextCompleted
        ? new Date()
            .toISOString()
        : null;

    setBusyId(
      subtask.id
    );

    /*
     * Optimistic UI。
     */
    setSubtasks(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            subtask.id
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
          completed:
            nextCompleted,

          completed_at:
            nextCompletedAt,
        })
        .eq(
          "id",
          subtask.id
        );

    setBusyId(
      null
    );

    if (
      updateError
    ) {
      /*
       * 更新失败时恢复原状态。
       */
      setSubtasks(
        (
          current
        ) =>
          current.map(
            (
              item
            ) =>
              item.id ===
              subtask.id
                ? subtask
                : item
          )
      );

      setError(
        "更新步骤失败：" +
          updateError.message
      );
    }
  }


  /**
   * 删除 checklist item。
   *
   * todo_id 使用 on delete cascade，
   * 所以删除整个 Todo 时这些步骤也会自动清理。
   */
  async function deleteSubtask(
    subtask:
      TodoSubtask
  ) {
    if (
      busyId
    ) {
      return;
    }

    const previous =
      subtasks;

    setBusyId(
      subtask.id
    );

    setSubtasks(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            subtask.id
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
          "todo_subtasks"
        )
        .delete()
        .eq(
          "id",
          subtask.id
        );

    setBusyId(
      null
    );

    if (
      deleteError
    ) {
      setSubtasks(
        previous
      );

      setError(
        "删除步骤失败：" +
          deleteError.message
      );
    }
  }


  const completedCount =
    subtasks.filter(
      (
        item
      ) =>
        item.completed
    ).length;


  return (
    <section className="rounded-2xl border border-line bg-paper/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">
            任务清单
          </h3>

          <p className="mt-1 text-xs text-ink-faint">
            {subtasks.length ===
            0
              ? "把大任务拆成几个更容易开始的小步骤。"
              : `${completedCount}/${subtasks.length} 已完成`}
          </p>
        </div>

        {subtasks.length >
          0 && (
          <span className="rounded-full bg-sage-50 px-2.5 py-1 text-[10px] text-sage-700">
            {Math.round(
              (
                completedCount /
                subtasks.length
              ) *
                100
            )}
            %
          </span>
        )}
      </div>


      <div className="mt-4 space-y-2">
        {loading && (
          <p className="text-xs text-ink-faint">
            正在读取清单…
          </p>
        )}


        {!loading &&
          subtasks.map(
            (
              subtask
            ) => (
              <div
                key={
                  subtask.id
                }
                className="group flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/70"
              >
                <button
                  type="button"
                  disabled={
                    busyId ===
                    subtask.id
                  }
                  onClick={() =>
                    toggleSubtask(
                      subtask
                    )
                  }
                  className="shrink-0 text-sage-700"
                >
                  {subtask.completed ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4 text-ink-faint" />
                  )}
                </button>

                <p
                  className={`min-w-0 flex-1 text-sm ${
                    subtask.completed
                      ? "text-ink-faint line-through"
                      : "text-ink"
                  }`}
                >
                  {
                    subtask.title
                  }
                </p>

                {subtask.source ===
                  "ai" && (
                  <span className="rounded-full bg-mist-50 px-2 py-0.5 text-[9px] text-mist-500">
                    AI
                  </span>
                )}

                <button
                  type="button"
                  onClick={() =>
                    deleteSubtask(
                      subtask
                    )
                  }
                  className="opacity-0 transition group-hover:opacity-100"
                  aria-label="删除步骤"
                >
                  <Trash2 className="h-3.5 w-3.5 text-ink-faint hover:text-blush-500" />
                </button>
              </div>
            )
          )}
      </div>


      <div className="mt-4 flex gap-2">
        <input
          value={
            newTitle
          }
          onChange={(
            event
          ) =>
            setNewTitle(
              event.target
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

              void addSubtask();
            }
          }}
          placeholder="添加一个小步骤…"
          className="input min-w-0 flex-1"
        />

        <button
          type="button"
          disabled={
            adding ||
            !newTitle.trim()
          }
          onClick={() =>
            void addSubtask()
          }
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
          aria-label="添加步骤"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>


      {error && (
        <p className="mt-3 text-xs text-blush-500">
          {error}
        </p>
      )}


      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-faint"
        title="AI 拆分将在后续版本接入"
      >
        ✨ AI 帮我拆分
        <span className="ml-1 opacity-60">
          Coming later
        </span>
      </button>
    </section>
  );
}
