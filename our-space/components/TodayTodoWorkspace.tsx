"use client";

import {
  useState,
} from "react";

import QuickNotes from "@/components/QuickNotes";

import TodoList, {
  type Todo,
  type TodoNotesOpenPayload,
} from "@/components/TodoList";


type TodayTodoWorkspaceProps = {
  todayTodos: Todo[];
  todayCompleted?: Todo[];
  title?: string;
  description?: string;
  showProgress?: boolean;
};


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


  const total =
    todayTodos.length +
    todayCompleted.length;


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
                  {
                    todayCompleted.length
                  }
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
              todos={
                todayTodos
              }
              onOpenNotes={
                openNotes
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
              />
            </div>
          )}
        </section>


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
