"use client";

import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   Types
========================================================= */

export type QuickNoteColor =
  | "cream"
  | "blush"
  | "sage"
  | "sky"
  | "lavender";

export type QuickNote = {
  id: string;
  todo_id: string;
  subtask_id: string | null;
  title: string | null;
  content: string;
  color: QuickNoteColor;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuickNotesSubtask = {
  id: string;
  title: string;
  sort_order: number;
};

type QuickNotesProps = {
  todoId: string;
  todoTitle?: string;

  /*
   * Todo Workspace 可以把左侧最新 subtasks 直接传进来，
   * 这样左右两栏会即时同步。
   * 如果没传，QuickNotes 会自己从 Supabase 读取。
   */
  subtasks?: QuickNotesSubtask[];
  onClose?: () => void;

  /* 预留给后续自动滚动到指定 Step。 */
  initialSubtaskId?: string | null;
};

/* =========================================================
   Visual config
========================================================= */

const COLOR_OPTIONS: {
  value: QuickNoteColor;
  label: string;
  dotClass: string;
}[] = [
  { value: "cream", label: "Cream", dotClass: "bg-[#f6e8c8]" },
  { value: "blush", label: "Blush", dotClass: "bg-[#efcfd3]" },
  { value: "sage", label: "Sage", dotClass: "bg-[#cdddc9]" },
  { value: "sky", label: "Sky", dotClass: "bg-[#cfe0ea]" },
  { value: "lavender", label: "Lavender", dotClass: "bg-[#ddd4ea]" },
];

const NOTE_BACKGROUND: Record<QuickNoteColor, string> = {
  cream: "bg-[#fffaf0]",
  blush: "bg-[#fff5f6]",
  sage: "bg-[#f5f9f3]",
  sky: "bg-[#f3f8fb]",
  lavender: "bg-[#f8f5fb]",
};

/* =========================================================
   DnD target ids

   一个 section 有两个明确 drop target：
   - header = 放到 section 最前面
   - bottom rail = 放到 section 最后面

   中间则直接拖到某张 Note 上决定插入位置。
   这样比“整个 section 都是 droppable”稳定很多，
   尤其能改善从下往上拖时被当前区域吸住的问题。
========================================================= */

const UNSORTED_KEY = "__unsorted__";

function sectionKey(subtaskId: string | null) {
  return subtaskId ?? UNSORTED_KEY;
}

function sectionStartId(subtaskId: string | null) {
  return `section-start:${sectionKey(subtaskId)}`;
}

function sectionEndId(subtaskId: string | null) {
  return `section-end:${sectionKey(subtaskId)}`;
}

function parseSectionTarget(id: string):
  | { subtaskId: string | null; position: "start" | "end" }
  | null {
  const startPrefix = "section-start:";
  const endPrefix = "section-end:";

  if (id.startsWith(startPrefix)) {
    const raw = id.slice(startPrefix.length);
    return {
      subtaskId: raw === UNSORTED_KEY ? null : raw,
      position: "start",
    };
  }

  if (id.startsWith(endPrefix)) {
    const raw = id.slice(endPrefix.length);
    return {
      subtaskId: raw === UNSORTED_KEY ? null : raw,
      position: "end",
    };
  }

  return null;
}

function describeUnknownError(value: unknown) {
  if (value instanceof Error) return value.message;

  if (typeof Event !== "undefined" && value instanceof Event) {
    return value.type ? `browser event: ${value.type}` : "browser event";
  }

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* =========================================================
   Main panel
========================================================= */

export default function QuickNotes({
  todoId,
  todoTitle,
  subtasks: providedSubtasks,
  onClose,
}: QuickNotesProps) {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loadedSubtasks, setLoadedSubtasks] = useState<QuickNotesSubtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* undefined=关闭, null=Unsorted, string=某个 Step */
  const [composerSubtaskId, setComposerSubtaskId] =
    useState<string | null | undefined>(undefined);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftColor, setDraftColor] = useState<QuickNoteColor>("cream");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState<QuickNoteColor>("cream");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* 当前拖动中的 Note，用于 overlay 和 drop UI。 */
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  /* 右侧 section 可折叠，但不会改变真正 subtask 顺序。 */
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set()
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  /* =======================================================
     Load Notes
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data, error: loadError } = await supabase
          .from("quick_notes")
          .select(`
            id,
            todo_id,
            subtask_id,
            title,
            content,
            color,
            sort_order,
            created_at,
            updated_at
          `)
          .eq("todo_id", todoId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (loadError) {
          setNotes([]);
          setError("读取 Quick Notes 失败：" + loadError.message);
          return;
        }

        setNotes((data ?? []) as QuickNote[]);
      } catch (unknownError) {
        if (cancelled) return;
        setNotes([]);
        setError(
          "打开 Quick Notes 时网络请求失败：" +
            describeUnknownError(unknownError)
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, [todoId]);

  /* =======================================================
     Fallback load subtasks
  ======================================================= */

  useEffect(() => {
    if (providedSubtasks) return;

    let cancelled = false;

    async function loadSubtasks() {
      try {
        const supabase = createClient();
        const { data, error: loadError } = await supabase
          .from("todo_subtasks")
          .select(`
            id,
            title,
            sort_order
          `)
          .eq("todo_id", todoId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (loadError) {
          setLoadedSubtasks([]);
          setError("读取任务步骤失败：" + loadError.message);
          return;
        }

        setLoadedSubtasks((data ?? []) as QuickNotesSubtask[]);
      } catch (unknownError) {
        if (cancelled) return;
        setLoadedSubtasks([]);
        setError("读取任务步骤失败：" + describeUnknownError(unknownError));
      }
    }

    void loadSubtasks();
    return () => {
      cancelled = true;
    };
  }, [todoId, providedSubtasks]);

  useEffect(() => {
    if (composerSubtaskId !== undefined) {
      textareaRef.current?.focus();
    }
  }, [composerSubtaskId]);

  /* =======================================================
     Derived data
  ======================================================= */

  const subtasks = providedSubtasks ?? loadedSubtasks;

  const sortedSubtasks = useMemo(
    () => [...subtasks].sort((a, b) => a.sort_order - b.sort_order),
    [subtasks]
  );

  const validSubtaskIds = useMemo(
    () => new Set(sortedSubtasks.map((subtask) => subtask.id)),
    [sortedSubtasks]
  );

  function effectiveSubtaskId(note: QuickNote): string | null {
    if (note.subtask_id === null) return null;
    return validSubtaskIds.has(note.subtask_id) ? note.subtask_id : null;
  }

  const unsortedNotes = useMemo(
    () =>
      notes
        .filter((note) => {
          if (note.subtask_id === null) return true;
          return !validSubtaskIds.has(note.subtask_id);
        })
        .sort((a, b) => a.sort_order - b.sort_order),
    [notes, validSubtaskIds]
  );

  function notesForSubtask(subtaskId: string) {
    return notes
      .filter((note) => effectiveSubtaskId(note) === subtaskId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function notesForSection(subtaskId: string | null) {
    return subtaskId === null ? unsortedNotes : notesForSubtask(subtaskId);
  }

  function getNextSortOrder(subtaskId: string | null) {
    const sectionNotes = notesForSection(subtaskId);
    if (sectionNotes.length === 0) return 1000;
    return Math.max(...sectionNotes.map((note) => note.sort_order)) + 1000;
  }

  const activeNote = activeNoteId
    ? notes.find((note) => note.id === activeNoteId) ?? null
    : null;

  /* =======================================================
     Section UI state
  ======================================================= */

  function toggleSection(subtaskId: string | null) {
    const key = sectionKey(subtaskId);

    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandSection(subtaskId: string | null) {
    const key = sectionKey(subtaskId);

    setCollapsedSections((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  /* =======================================================
     Persist Note layout
  ======================================================= */

  async function persistNoteLayout(
    previous: QuickNote[],
    nextNotes: QuickNote[],
    changedIds: Set<string>
  ) {
    /* Optimistic UI：先更新，数据库失败再回滚。 */
    setNotes(nextNotes);
    setError(null);

    try {
      const supabase = createClient();
      const changedNotes = nextNotes.filter((note) => changedIds.has(note.id));

      const results = await Promise.all(
        changedNotes.map((note) =>
          supabase
            .from("quick_notes")
            .update({
              subtask_id: note.subtask_id,
              sort_order: note.sort_order,
            })
            .eq("id", note.id)
        )
      );

      const saveError = results.find((result) => result.error)?.error;

      if (saveError) {
        setNotes(previous);
        setError("保存 Note 位置失败：" + saveError.message);
      }
    } catch (unknownError) {
      setNotes(previous);
      setError("保存 Note 位置失败：" + describeUnknownError(unknownError));
    }
  }

  /* =======================================================
     Drag interactions
  ======================================================= */

  function handleDragStart(event: DragStartEvent) {
    setActiveNoteId(String(event.active.id));
    closeComposer();
    setError(null);
  }

  /*
   * 自定义 panel auto-scroll。
   * 拖到顶部 / 底部约 80px 区域时持续滚动，
   * 专门解决“向上拖不灵”的问题。
   */
  function handleDragMove(event: DragMoveEvent) {
    const container = scrollRef.current;
    const translated = event.active.rect.current.translated;

    if (!container || !translated) return;

    const bounds = container.getBoundingClientRect();
    const centerY = translated.top + translated.height / 2;
    const edgeSize = 80;

    if (centerY < bounds.top + edgeSize) {
      container.scrollBy({ top: -18, behavior: "auto" });
      return;
    }

    if (centerY > bounds.bottom - edgeSize) {
      container.scrollBy({ top: 18, behavior: "auto" });
    }
  }

  function handleDragCancel() {
    setActiveNoteId(null);
  }

  function shouldInsertAfter(event: DragEndEvent) {
    const translated = event.active.rect.current.translated;
    if (!translated || !event.over) return false;

    const activeCenter = translated.top + translated.height / 2;
    const overCenter = event.over.rect.top + event.over.rect.height / 2;
    return activeCenter > overCenter;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveNoteId(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const movingNote = notes.find((note) => note.id === activeId);

    if (!movingNote) return;

    const sourceSubtaskId = effectiveSubtaskId(movingNote);
    const sectionTarget = parseSectionTarget(overId);
    const overNote = notes.find((note) => note.id === overId);

    let destinationSubtaskId: string | null | undefined;
    let insertMode: "start" | "end" | "note";

    if (sectionTarget) {
      destinationSubtaskId = sectionTarget.subtaskId;
      insertMode = sectionTarget.position;
    } else if (overNote) {
      destinationSubtaskId = effectiveSubtaskId(overNote);
      insertMode = "note";
    } else {
      return;
    }

    expandSection(destinationSubtaskId);

    const previous = notes;

    const sourceNotes = notesForSection(sourceSubtaskId).filter(
      (note) => note.id !== activeId
    );

    const destinationNotes = notesForSection(destinationSubtaskId).filter(
      (note) => note.id !== activeId
    );

    let insertIndex = destinationNotes.length;

    if (insertMode === "start") {
      insertIndex = 0;
    } else if (insertMode === "end") {
      insertIndex = destinationNotes.length;
    } else if (overNote) {
      const overIndex = destinationNotes.findIndex(
        (note) => note.id === overNote.id
      );

      if (overIndex >= 0) {
        insertIndex = overIndex + (shouldInsertAfter(event) ? 1 : 0);
      }
    }

    const movedNote: QuickNote = {
      ...movingNote,
      subtask_id: destinationSubtaskId,
    };

    const nextDestination = [
      ...destinationNotes.slice(0, insertIndex),
      movedNote,
      ...destinationNotes.slice(insertIndex),
    ].map((note, index) => ({
      ...note,
      subtask_id: destinationSubtaskId,
      sort_order: (index + 1) * 1000,
    }));

    const nextSource =
      sourceSubtaskId === destinationSubtaskId
        ? []
        : sourceNotes.map((note, index) => ({
            ...note,
            subtask_id: sourceSubtaskId,
            sort_order: (index + 1) * 1000,
          }));

    const patchMap = new Map(
      [...nextSource, ...nextDestination].map((note) => [note.id, note])
    );

    const nextNotes = previous.map(
      (note) => patchMap.get(note.id) ?? note
    );

    const changedIds = new Set(
      [...nextSource, ...nextDestination].map((note) => note.id)
    );

    void persistNoteLayout(previous, nextNotes, changedIds);
  }

  /* =======================================================
     Composer
  ======================================================= */

  function openComposer(subtaskId: string | null) {
    setEditingId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("cream");
    setComposerSubtaskId(subtaskId);
    expandSection(subtaskId);
  }

  function closeComposer() {
    setComposerSubtaskId(undefined);
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("cream");
  }

  async function addNote() {
    const cleanContent = draftContent.trim();

    if (!cleanContent || busy || composerSubtaskId === undefined) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("quick_notes")
        .insert({
          todo_id: todoId,
          subtask_id: composerSubtaskId,
          title: draftTitle.trim() || null,
          content: cleanContent,
          color: draftColor,
          sort_order: getNextSortOrder(composerSubtaskId),
        })
        .select(`
          id,
          todo_id,
          subtask_id,
          title,
          content,
          color,
          sort_order,
          created_at,
          updated_at
        `)
        .single();

      if (insertError || !data) {
        setError(
          "新增 Quick Note 失败：" +
            (insertError?.message ?? "没有返回数据")
        );
        return;
      }

      setNotes((current) => [...current, data as QuickNote]);
      closeComposer();
    } catch (unknownError) {
      setError("新增 Quick Note 失败：" + describeUnknownError(unknownError));
    } finally {
      setBusy(false);
    }
  }

  /* =======================================================
     Delete
  ======================================================= */

  async function deleteNote(note: QuickNote) {
    if (deletingId) return;

    const previous = notes;
    setDeletingId(note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("quick_notes")
        .delete()
        .eq("id", note.id);

      if (deleteError) {
        setNotes(previous);
        setError("删除 Quick Note 失败：" + deleteError.message);
      }
    } catch (unknownError) {
      setNotes(previous);
      setError("删除 Quick Note 失败：" + describeUnknownError(unknownError));
    } finally {
      setDeletingId(null);
    }
  }

  /* =======================================================
     Edit
  ======================================================= */

  function startEditing(note: QuickNote) {
    closeComposer();
    setEditingId(note.id);
    setEditTitle(note.title ?? "");
    setEditContent(note.content);
    setEditColor(note.color);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
    setEditColor("cream");
  }

  async function saveEdit(note: QuickNote) {
    const cleanContent = editContent.trim();
    if (!cleanContent || busy) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: updateError } = await supabase
        .from("quick_notes")
        .update({
          title: editTitle.trim() || null,
          content: cleanContent,
          color: editColor,
        })
        .eq("id", note.id)
        .select(`
          id,
          todo_id,
          subtask_id,
          title,
          content,
          color,
          sort_order,
          created_at,
          updated_at
        `)
        .single();

      if (updateError || !data) {
        setError(
          "编辑 Quick Note 失败：" +
            (updateError?.message ?? "没有返回数据")
        );
        return;
      }

      setNotes((current) =>
        current.map((item) => (item.id === note.id ? (data as QuickNote) : item))
      );

      cancelEditing();
    } catch (unknownError) {
      setError("编辑 Quick Note 失败：" + describeUnknownError(unknownError));
    } finally {
      setBusy(false);
    }
  }

  /* =======================================================
     Move dropdown fallback
  ======================================================= */

  async function moveNote(note: QuickNote, destination: string | null) {
    const currentSection = effectiveSubtaskId(note);
    if (currentSection === destination) return;

    const previous = notes;
    const nextSortOrder = getNextSortOrder(destination);

    const optimistic = notes.map((item) =>
      item.id === note.id
        ? {
            ...item,
            subtask_id: destination,
            sort_order: nextSortOrder,
          }
        : item
    );

    setNotes(optimistic);
    setError(null);

    try {
      const supabase = createClient();
      const { error: moveError } = await supabase
        .from("quick_notes")
        .update({
          subtask_id: destination,
          sort_order: nextSortOrder,
        })
        .eq("id", note.id);

      if (moveError) {
        setNotes(previous);
        setError("移动 Quick Note 失败：" + moveError.message);
      } else {
        expandSection(destination);
      }
    } catch (unknownError) {
      setNotes(previous);
      setError("移动 Quick Note 失败：" + describeUnknownError(unknownError));
    }
  }

  /* =======================================================
     Panel UI
  ======================================================= */

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Quick Notes
          </p>

          {todoTitle && (
            <p className="mt-1 truncate text-sm font-medium text-ink">
              {todoTitle}
            </p>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-faint transition hover:bg-paper hover:text-ink"
            aria-label="关闭 Quick Notes"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4"
      >
        {loading ? (
          <p className="py-10 text-center text-xs text-ink-faint">
            正在读取 Notes…
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            /*
             * pointerWithin 更尊重鼠标实际位置，
             * 比 closestCenter 更适合 section + note 混合拖拽。
             */
            collisionDetection={pointerWithin}
            autoScroll={false}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="space-y-3">
              <NoteSection
                title="Unsorted"
                stepLabel={null}
                subtaskId={null}
                notes={unsortedNotes}
                subtasks={sortedSubtasks}
                dragging={Boolean(activeNoteId)}
                collapsed={collapsedSections.has(sectionKey(null))}
                onToggleCollapsed={() => toggleSection(null)}
                composerOpen={composerSubtaskId === null}
                editingId={editingId}
                draftTitle={draftTitle}
                draftContent={draftContent}
                draftColor={draftColor}
                editTitle={editTitle}
                editContent={editContent}
                editColor={editColor}
                busy={busy}
                deletingId={deletingId}
                textareaRef={textareaRef}
                onOpenComposer={() => openComposer(null)}
                onCloseComposer={closeComposer}
                onDraftTitle={setDraftTitle}
                onDraftContent={setDraftContent}
                onDraftColor={setDraftColor}
                onAddNote={addNote}
                onStartEdit={startEditing}
                onCancelEdit={cancelEditing}
                onEditTitle={setEditTitle}
                onEditContent={setEditContent}
                onEditColor={setEditColor}
                onSaveEdit={saveEdit}
                onDelete={deleteNote}
                onMove={moveNote}
              />

              {sortedSubtasks.map((subtask, index) => (
                <NoteSection
                  key={subtask.id}
                  title={subtask.title}
                  stepLabel={String(index + 1).padStart(2, "0")}
                  subtaskId={subtask.id}
                  notes={notesForSubtask(subtask.id)}
                  subtasks={sortedSubtasks}
                  dragging={Boolean(activeNoteId)}
                  collapsed={collapsedSections.has(sectionKey(subtask.id))}
                  onToggleCollapsed={() => toggleSection(subtask.id)}
                  composerOpen={composerSubtaskId === subtask.id}
                  editingId={editingId}
                  draftTitle={draftTitle}
                  draftContent={draftContent}
                  draftColor={draftColor}
                  editTitle={editTitle}
                  editContent={editContent}
                  editColor={editColor}
                  busy={busy}
                  deletingId={deletingId}
                  textareaRef={textareaRef}
                  onOpenComposer={() => openComposer(subtask.id)}
                  onCloseComposer={closeComposer}
                  onDraftTitle={setDraftTitle}
                  onDraftContent={setDraftContent}
                  onDraftColor={setDraftColor}
                  onAddNote={addNote}
                  onStartEdit={startEditing}
                  onCancelEdit={cancelEditing}
                  onEditTitle={setEditTitle}
                  onEditContent={setEditContent}
                  onEditColor={setEditColor}
                  onSaveEdit={saveEdit}
                  onDelete={deleteNote}
                  onMove={moveNote}
                />
              ))}
            </div>

            <DragOverlay
              dropAnimation={{
                duration: 150,
                easing: "cubic-bezier(0.22, 0.8, 0.3, 1)",
              }}
            >
              {activeNote ? <DragPreview note={activeNote} /> : null}
            </DragOverlay>
          </DndContext>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-blush-50 px-3 py-2 text-xs text-blush-500">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

/* =========================================================
   Interactive section
========================================================= */

type NoteSectionProps = {
  title: string;
  stepLabel: string | null;
  subtaskId: string | null;
  notes: QuickNote[];
  subtasks: QuickNotesSubtask[];
  dragging: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;

  composerOpen: boolean;
  editingId: string | null;
  draftTitle: string;
  draftContent: string;
  draftColor: QuickNoteColor;
  editTitle: string;
  editContent: string;
  editColor: QuickNoteColor;
  busy: boolean;
  deletingId: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;

  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onDraftTitle: (value: string) => void;
  onDraftContent: (value: string) => void;
  onDraftColor: (value: QuickNoteColor) => void;
  onAddNote: () => Promise<void>;
  onStartEdit: (note: QuickNote) => void;
  onCancelEdit: () => void;
  onEditTitle: (value: string) => void;
  onEditContent: (value: string) => void;
  onEditColor: (value: QuickNoteColor) => void;
  onSaveEdit: (note: QuickNote) => Promise<void>;
  onDelete: (note: QuickNote) => Promise<void>;
  onMove: (note: QuickNote, destination: string | null) => Promise<void>;
};

function NoteSection({
  title,
  stepLabel,
  subtaskId,
  notes,
  subtasks,
  dragging,
  collapsed,
  onToggleCollapsed,
  composerOpen,
  editingId,
  draftTitle,
  draftContent,
  draftColor,
  editTitle,
  editContent,
  editColor,
  busy,
  deletingId,
  textareaRef,
  onOpenComposer,
  onCloseComposer,
  onDraftTitle,
  onDraftContent,
  onDraftColor,
  onAddNote,
  onStartEdit,
  onCancelEdit,
  onEditTitle,
  onEditContent,
  onEditColor,
  onSaveEdit,
  onDelete,
  onMove,
}: NoteSectionProps) {
  /* Header = 放到最前面。 */
  const {
    setNodeRef: setHeaderDropRef,
    isOver: isHeaderOver,
  } = useDroppable({
    id: sectionStartId(subtaskId),
    data: { type: "section-start", subtaskId },
  });

  /* 尾部 rail = 放到最后面。 */
  const {
    setNodeRef: setEndDropRef,
    isOver: isEndOver,
  } = useDroppable({
    id: sectionEndId(subtaskId),
    data: { type: "section-end", subtaskId },
  });

  return (
    <section
      className={`overflow-hidden rounded-2xl border transition ${
        dragging && (isHeaderOver || isEndOver)
          ? "border-sage-300 bg-sage-50/50 shadow-sm"
          : "border-line/70 bg-white/35"
      }`}
    >
      {/*
       * Section header 是真正可交互容器：
       * - 折叠 / 展开
       * - Add Note
       * - 拖 Note 到 header => 放到 section 顶部
       */}
      <div
        ref={setHeaderDropRef}
        className={`flex min-h-11 items-center gap-2 px-2.5 py-2 transition ${
          dragging && isHeaderOver ? "bg-sage-100/75" : "bg-white/45"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition hover:bg-white hover:text-ink-soft"
          aria-label={collapsed ? "展开 Notes section" : "折叠 Notes section"}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {stepLabel && (
          <span className="rounded-md bg-sage-50 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-sage-700">
            {stepLabel}
          </span>
        )}

        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-ink-soft">
          {title}
        </h3>

        {dragging && isHeaderOver && (
          <span className="rounded-full bg-white/75 px-2 py-1 text-[9px] font-medium text-sage-700">
            Move to top
          </span>
        )}

        <span className="rounded-full bg-black/[0.035] px-2 py-0.5 text-[9px] tabular-nums text-ink-faint">
          {notes.length}
        </span>

        <button
          type="button"
          onClick={onOpenComposer}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
          aria-label={`Add note to ${title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-2.5 pb-2.5">
          {composerOpen && (
            <NoteComposer
              textareaRef={textareaRef}
              title={draftTitle}
              content={draftContent}
              color={draftColor}
              busy={busy}
              onTitle={onDraftTitle}
              onContent={onDraftContent}
              onColor={onDraftColor}
              onSave={onAddNote}
              onCancel={onCloseComposer}
            />
          )}

          <SortableContext
            items={notes.map((note) => note.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="mt-2 space-y-2">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  currentSubtaskId={subtaskId}
                  subtasks={subtasks}
                  editing={editingId === note.id}
                  editTitle={editTitle}
                  editContent={editContent}
                  editColor={editColor}
                  busy={busy}
                  deleting={deletingId === note.id}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onEditTitle={onEditTitle}
                  onEditContent={onEditContent}
                  onEditColor={onEditColor}
                  onSaveEdit={onSaveEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              ))}
            </div>
          </SortableContext>

          {/*
           * Bottom drop rail：
           * 平时几乎不可见，拖动时才出现明确 drop affordance。
           */}
          <div
            ref={setEndDropRef}
            className={`mt-2 flex items-center justify-center rounded-xl border border-dashed transition-all ${
              dragging ? "h-10" : "h-1 border-transparent"
            } ${
              dragging && isEndOver
                ? "border-sage-400 bg-sage-50 text-sage-700"
                : dragging
                  ? "border-line/80 bg-white/20 text-ink-faint"
                  : ""
            }`}
          >
            {dragging && (
              <span className="text-[9px] font-medium">
                {isEndOver
                  ? "Drop at end"
                  : notes.length === 0
                    ? "Drop note here"
                    : "Move here"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 折叠状态仍然保留一个可放入的区域。 */}
      {collapsed && dragging && (
        <div
          ref={setEndDropRef}
          className={`mx-2.5 mb-2.5 flex h-8 items-center justify-center rounded-xl border border-dashed text-[9px] transition ${
            isEndOver
              ? "border-sage-400 bg-sage-50 text-sage-700"
              : "border-line/80 text-ink-faint"
          }`}
        >
          Drop into section
        </div>
      )}
    </section>
  );
}

/* =========================================================
   Composer
========================================================= */

function NoteComposer({
  textareaRef,
  title,
  content,
  color,
  busy,
  onTitle,
  onContent,
  onColor,
  onSave,
  onCancel,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  title: string;
  content: string;
  color: QuickNoteColor;
  busy: boolean;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onColor: (value: QuickNoteColor) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-line/80 bg-white/85 p-3 shadow-sm">
      <input
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-faint/75"
      />

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => onContent(event.target.value)}
        onKeyDown={(event) => {
          const saveShortcut =
            (event.ctrlKey || event.metaKey) && event.key === "Enter";

          if (saveShortcut) {
            event.preventDefault();
            void onSave();
          }
        }}
        rows={3}
        placeholder="Write a note..."
        className="mt-2 w-full resize-none bg-transparent text-xs leading-5 text-ink-soft outline-none placeholder:text-ink-faint/75"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <ColorPicker value={color} onChange={onColor} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-[10px] text-ink-faint transition hover:bg-paper hover:text-ink-soft"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={busy || !content.trim()}
            onClick={() => void onSave()}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sage-100 px-2.5 text-[10px] font-medium text-sage-700 transition hover:bg-sage-300/60 disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Sortable Note card

   新拖拽 UI：
   - 顶部独立 drag rail
   - 只有 GripVertical 可以真正拖动
   - Edit / Delete / Move 不抢 pointer event
   - 拖动中原卡片变淡，overlay 浮起
========================================================= */

function NoteCard({
  note,
  currentSubtaskId,
  subtasks,
  editing,
  editTitle,
  editContent,
  editColor,
  busy,
  deleting,
  onStartEdit,
  onCancelEdit,
  onEditTitle,
  onEditContent,
  onEditColor,
  onSaveEdit,
  onDelete,
  onMove,
}: {
  note: QuickNote;
  currentSubtaskId: string | null;
  subtasks: QuickNotesSubtask[];
  editing: boolean;
  editTitle: string;
  editContent: string;
  editColor: QuickNoteColor;
  busy: boolean;
  deleting: boolean;
  onStartEdit: (note: QuickNote) => void;
  onCancelEdit: () => void;
  onEditTitle: (value: string) => void;
  onEditContent: (value: string) => void;
  onEditColor: (value: QuickNoteColor) => void;
  onSaveEdit: (note: QuickNote) => Promise<void>;
  onDelete: (note: QuickNote) => Promise<void>;
  onMove: (note: QuickNote, destination: string | null) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: note.id,
    disabled: editing,
    data: {
      type: "quick-note",
      subtaskId: currentSubtaskId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-2xl border border-line/80 bg-white/90 p-3 shadow-sm"
      >
        <input
          value={editTitle}
          onChange={(event) => onEditTitle(event.target.value)}
          placeholder="Title (optional)"
          className="w-full bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-faint/75"
        />

        <textarea
          value={editContent}
          onChange={(event) => onEditContent(event.target.value)}
          rows={4}
          className="mt-2 w-full resize-none bg-transparent text-xs leading-5 text-ink-soft outline-none"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <ColorPicker value={editColor} onChange={onEditColor} />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg px-2 py-1 text-[10px] text-ink-faint hover:bg-paper"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={busy || !editContent.trim()}
              onClick={() => void onSaveEdit(note)}
              className="inline-flex items-center gap-1 rounded-lg bg-sage-100 px-2 py-1 text-[10px] font-medium text-sage-700 disabled:opacity-40"
            >
              <Save className="h-3 w-3" />
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group relative overflow-hidden rounded-2xl border border-line/60 transition ${
        NOTE_BACKGROUND[note.color]
      } ${
        isDragging
          ? "scale-[0.985] opacity-20"
          : "hover:-translate-y-px hover:shadow-sm"
      }`}
    >
      {/* 顶部 drag rail：让用户一眼知道卡片可以移动。 */}
      <div className="flex h-7 items-center border-b border-black/[0.035] bg-white/25 px-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-5 min-w-8 cursor-grab items-center justify-center rounded-md text-ink-faint/45 transition hover:bg-white/80 hover:text-sage-700 active:cursor-grabbing"
          aria-label="拖动 Note"
          title="拖动排序或移动到其他 Step"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <span className="ml-1 text-[8px] font-medium uppercase tracking-[0.14em] text-ink-faint/55">
          drag
        </span>

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onStartEdit(note)}
            className="rounded-md p-1 text-ink-faint transition hover:bg-white/80 hover:text-ink-soft"
            aria-label="Edit note"
          >
            <Pencil className="h-3 w-3" />
          </button>

          <button
            type="button"
            disabled={deleting}
            onClick={() => void onDelete(note)}
            className="rounded-md p-1 text-ink-faint transition hover:bg-white/80 hover:text-blush-500 disabled:opacity-40"
            aria-label="Delete note"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="p-3.5 pt-3">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage-500/80" />

          <div className="min-w-0 flex-1">
            {note.title && (
              <p className="mb-1 text-xs font-medium text-ink">{note.title}</p>
            )}

            <p className="whitespace-pre-wrap text-xs leading-5 text-ink-soft">
              {note.content}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end border-t border-black/[0.04] pt-2">
          <select
            value={currentSubtaskId ?? UNSORTED_KEY}
            onChange={(event) => {
              const value = event.target.value;
              void onMove(note, value === UNSORTED_KEY ? null : value);
            }}
            className="max-w-[180px] truncate rounded-lg border border-line/60 bg-white/55 px-2 py-1 text-[9px] text-ink-faint outline-none transition hover:bg-white"
            aria-label="Move note"
          >
            <option value={UNSORTED_KEY}>Move to · Unsorted</option>

            {subtasks.map((subtask) => (
              <option key={subtask.id} value={subtask.id}>
                Move to · {subtask.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   Drag overlay
========================================================= */

function DragPreview({ note }: { note: QuickNote }) {
  return (
    <div
      className={`w-[320px] max-w-[82vw] rotate-[1deg] overflow-hidden rounded-2xl border border-sage-300/80 shadow-[0_20px_50px_rgba(60,50,40,0.18)] ${
        NOTE_BACKGROUND[note.color]
      }`}
    >
      <div className="flex h-7 items-center border-b border-black/[0.035] bg-white/45 px-2 text-sage-700">
        <GripVertical className="h-3.5 w-3.5" />
        <span className="ml-1 text-[8px] font-semibold uppercase tracking-[0.14em]">
          moving note
        </span>
      </div>

      <div className="flex items-start gap-2.5 p-3.5">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage-500/80" />

        <div className="min-w-0 flex-1">
          {note.title && (
            <p className="mb-1 truncate text-xs font-medium text-ink">
              {note.title}
            </p>
          )}

          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-ink-soft">
            {note.content}
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Color picker
========================================================= */

function ColorPicker({
  value,
  onChange,
}: {
  value: QuickNoteColor;
  onChange: (value: QuickNoteColor) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Note color">
      {COLOR_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-5 w-5 rounded-full border transition ${
            option.dotClass
          } ${
            value === option.value
              ? "border-sage-700 ring-2 ring-sage-100"
              : "border-black/5 hover:scale-110"
          }`}
          title={option.label}
          aria-label={option.label}
        />
      ))}
    </div>
  );
}
