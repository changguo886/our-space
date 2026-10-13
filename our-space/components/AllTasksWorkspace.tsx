"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import TodoList, { type Todo, type TodoCategory, type TodoNotesOpenPayload } from "@/components/TodoList";
import type { TodoSubtask } from "@/components/TodoSubtasks";
import QuickNotes from "@/components/QuickNotes";

type TaskType = "one_time" | "project" | "routine";
type Filter = "all" | TodoCategory | "unclassified";
type TypeFilter = "all" | TaskType;
type Sort = "date" | "title";
const categories: TodoCategory[] = ["work", "study", "life", "rest", "other"];

export default function AllTasksWorkspace({ todos }: { todos: Todo[] }) {
  const { dictionary, language } = useI18n();
  const zh = language === "zh-CN";
  const [categoryFilter, setCategoryFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<Sort>("date");
  const [collapsed, setCollapsed] = useState<Filter[]>([]);
  const [notesContext, setNotesContext] = useState<TodoNotesOpenPayload | null>(null);
  const [subtasksById, setSubtasksById] = useState<Record<string, TodoSubtask[]>>({});

  const labels: Record<Filter, string> = {
    all: zh ? "全部" : "All",
    work: dictionary.todo.categories.work,
    study: dictionary.todo.categories.study,
    life: dictionary.todo.categories.life,
    rest: dictionary.todo.categories.rest,
    other: dictionary.todo.categories.other,
    unclassified: zh ? "未分类" : "Unclassified",
  };
  const typeLabels: Record<TypeFilter, string> = {
    all: zh ? "全部类型" : "All types",
    one_time: zh ? "单次任务" : "One-time",
    project: zh ? "长期项目" : "Project",
    routine: zh ? "周期任务" : "Routine",
  };

  const filtered = useMemo(() => todos.filter(todo => (
    (categoryFilter === "all" ||
      (categoryFilter === "unclassified" ? !todo.category : todo.category === categoryFilter)) &&
    (typeFilter === "all" || (todo.task_type ?? "one_time") === typeFilter)
  )), [todos, categoryFilter, typeFilter]);

  const groups = useMemo(() => {
    const keys: Filter[] = [...categories, "unclassified"];
    return keys.map(key => ({
      key,
      tasks: filtered.filter(todo => (todo.category ?? "unclassified") === key)
        .sort((a, b) => sort === "title"
          ? a.title.localeCompare(b.title)
          : (a.task_date ?? "").localeCompare(b.task_date ?? "") || a.title.localeCompare(b.title)),
    })).filter(group => group.tasks.length > 0);
  }, [filtered, sort]);

  return (
    <section className="mx-auto mt-8 max-w-[1180px]">
      <div className={notesContext ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]" : ""}>
        <div className="card min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">{zh ? "全部任务" : "All Tasks"}</h2>
              <p className="mt-1 text-xs text-ink-faint">{zh ? "按照类别整理所有任务" : "Organize all tasks by category"}</p>
            </div>
            <span className="text-xs text-ink-faint">{filtered.length} {zh ? "项任务" : "tasks"}</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2" aria-label={zh ? "任务分类筛选" : "Category filter"}>
            {(["all", ...categories, "unclassified"] as Filter[]).map(key => (
              <button key={key} type="button" aria-pressed={categoryFilter === key}
                onClick={() => setCategoryFilter(key)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 ${categoryFilter === key
                  ? "border-sage-300 bg-sage-100 font-semibold text-sage-700"
                  : "border-line bg-white/70 text-ink-soft hover:bg-white"}`}>
                {labels[key]}
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <label className="text-xs text-ink-soft">
              {zh ? "任务类型" : "Task type"}
              <select className="input ml-2 w-auto" value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as TypeFilter)}>
                {(Object.keys(typeLabels) as TypeFilter[]).map(key => <option key={key} value={key}>{typeLabels[key]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              {zh ? "排序" : "Sort"}
              <select className="input ml-2 w-auto" value={sort} onChange={e => setSort(e.target.value as Sort)}>
                <option value="date">{zh ? "任务日期" : "Task date"}</option>
                <option value="title">{zh ? "名称" : "Title"}</option>
              </select>
            </label>
          </div>
          <div className="space-y-4">
            {groups.length === 0 && <p className="text-sm text-ink-faint">{zh ? "没有符合条件的任务。" : "No matching tasks."}</p>}
            {groups.map(group => {
              const open = !collapsed.includes(group.key);
              return (
                <div key={group.key} className="rounded-2xl border border-line bg-white/40 p-3">
                  <button type="button" aria-expanded={open}
                    onClick={() => setCollapsed(prev => open ? [...prev, group.key] : prev.filter(key => key !== group.key))}
                    className="mb-2 flex w-full items-center gap-2 rounded-lg p-1 text-left text-sm font-medium text-ink transition-colors hover:bg-paper/60">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span>{labels[group.key]}</span>
                    <span className="text-xs font-normal text-ink-faint">({group.tasks.length})</span>
                  </button>
                  {open && <TodoList todos={group.tasks} onOpenNotes={setNotesContext}
                    onSubtasksChange={(todoId, subtasks) => setSubtasksById(previous => ({...previous, [todoId]: subtasks}))} />}
                </div>
              );
            })}
          </div>
        </div>
        {notesContext && (
          <aside className="min-h-0 xl:sticky xl:top-6 xl:self-start">
            <div className="h-[min(76vh,780px)] min-h-[520px] overflow-hidden rounded-[22px] border border-line bg-white/80 shadow-soft">
              <QuickNotes todoId={notesContext.todoId} todoTitle={notesContext.todoTitle}
                subtasks={subtasksById[notesContext.todoId]}
                initialSubtaskId={notesContext.targetSubtaskId ?? null}
                onClose={() => setNotesContext(null)} />
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
