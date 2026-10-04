"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import QuickNotes from "@/components/QuickNotes";

import TodoList, {
  type Todo,
  type TodoNotesOpenPayload,
} from "@/components/TodoList";

import {
  type TodoSubtask,
} from "@/components/TodoSubtasks";


type TodayTodoWorkspaceProps = {
  todayTodos: Todo[];
  todayCompleted?: Todo[];
  title?: string;
  description?: string;
  showProgress?: boolean;
};


/* =========================================================
   Compare only fields QuickNotes actually cares about.

   completed / completed_at 不影响右侧 section 结构，
   所以完成一个 Step 时没必要让 QuickNotes 重新 render。
========================================================= */

function sameQuickNotesSubtasks(
  a: TodoSubtask[] | undefined,
  b: TodoSubtask[]
) {
  if (!a) {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  return a.every(
    (item, index) => {
      const other = b[index];

      return (
        item.id === other.id &&
        item.title === other.title &&
        item.sort_order ===
          other.sort_order
      );
    }
  );
}


export default function TodayTodoWorkspace({
  todayTodos,
  todayCompleted = [],
  title = "今天",
  description = "一点一点完成就好。",
  showProgress = true,
}: TodayTodoWorkspaceProps) {
  const [
    notesContext,
    setNotesContext,
  ] =
    useState<
      TodoNotesOpenPayload | null
    >(null);

  /*
   * 关键 state：
   *
   * 每个 Todo 对应一份当前最新的 subtasks。
   * 左侧 TodoSubtasks 改动后会立刻更新这里，
   * 右侧 QuickNotes 直接使用同一份数据。
   */
  const [
    subtasksByTodoId,
    setSubtasksByTodoId,
  ] = useState<
    Record<
      string,
      TodoSubtask[]
    >
  >({});


  function openNotes(
    payload:
      TodoNotesOpenPayload
  ) {
    setNotesContext(
      payload
    );
  }


  function closeNotes() {
    setNotesContext(
      null
    );
  }


  /* =======================================================
     Receive live subtasks from the left side.
  ======================================================= */

  const handleSubtasksChange =
    useCallback(
      (
        todoId: string,
        subtasks: TodoSubtask[]
      ) => {
        setSubtasksByTodoId(
          (current) => {
            const previous =
              current[todoId];

            /*
             * 如果 id / title / sort_order 都没有变化，
             * 保持原对象，减少右侧不必要 render。
             */
            if (
              sameQuickNotesSubtasks(
                previous,
                subtasks
              )
            ) {
              return current;
            }

            return {
              ...current,
              [todoId]:
                subtasks,
            };
          }
        );
      },
      []
    );


  const total =
    todayTodos.length +
    todayCompleted.length;


  /*
   * 如果当前 Todo 的 subtasks 已经由左侧加载过，
   * 直接传给 QuickNotes。
   *
   * 如果没有，则保持 undefined，QuickNotes 会自己 fallback fetch。
   */
  const activeNotesSubtasks =
    useMemo(
      () =>
        notesContext
          ? subtasksByTodoId[
              notesContext.todoId
            ]
          : undefined,
      [
        notesContext,
        subtasksByTodoId,
      ]
    );


  return (
    <div
      className={`mt-8 transition-[max-width] duration-200 ${
        notesContext
          ? "mx-auto max-w-[1180px]"
          : "mx-auto max-w-2xl"
      }`}
    >
      <div
        className={
          notesContext
            ? "grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"
            : "block"
        }
      >
        {/* =================================================
            Left: Todo workspace
        ================================================= */}
        <section className="card min-w-0 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-medium">
                {title}
              </h2>

              <p className="mt-1 text-xs text-ink-faint">
                {description}
              </p>
            </div>

            {showProgress && (
              <div className="text-right">
                <p className="text-xl font-semibold text-sage-700">
                  {todayCompleted.length}
                  /
                  {total}
                </p>

                <p className="text-xs text-ink-faint">
                  已完成
                </p>
              </div>
            )}
          </div>


          <div className="mt-5">
            <TodoList
              todos={todayTodos}
              onOpenNotes={
                openNotes
              }
              onSubtasksChange={
                handleSubtasksChange
              }
            />
          </div>


          {todayCompleted.length >
            0 && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="mb-3 text-xs font-medium text-ink-faint">
                今天完成
              </p>

              <TodoList
                todos={
                  todayCompleted
                }
                onOpenNotes={
                  openNotes
                }
                onSubtasksChange={
                  handleSubtasksChange
                }
              />
            </div>
          )}
        </section>


        {/* =================================================
            Right: independent Quick Notes panel
        ================================================= */}
        {notesContext && (
          <aside className="min-h-0 xl:sticky xl:top-6 xl:self-start">
            <div className="h-[min(76vh,780px)] min-h-[520px] overflow-hidden rounded-[22px] border border-line bg-white/80 shadow-soft backdrop-blur-sm">
              <QuickNotes
                todoId={
                  notesContext.todoId
                }
                todoTitle={
                  notesContext.todoTitle
                }

                /*
                 * 关键：右侧现在直接拿父级的最新 subtasks。
                 * 左边拖动 / 新增 / 删除后会立即同步。
                 */
                subtasks={
                  activeNotesSubtasks
                }

                initialSubtaskId={
                  notesContext.targetSubtaskId ??
                  null
                }
                onClose={
                  closeNotes
                }
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
