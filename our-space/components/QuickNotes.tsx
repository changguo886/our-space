"use client";

import {
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
} from "react";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
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
   * 兼容旧调用：
   * 如果父级没有传 subtasks，QuickNotes 会自己从 Supabase 读取。
   */
  subtasks?: QuickNotesSubtask[];

  onClose?: () => void;

  /*
   * Phase B 可用于点击某个 Step 的 Notes 按钮后自动定位。
   * 当前版本先保留接口，不做自动滚动。
   */
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
  {
    value: "cream",
    label: "Cream",
    dotClass: "bg-[#f6e8c8]",
  },
  {
    value: "blush",
    label: "Blush",
    dotClass: "bg-[#efcfd3]",
  },
  {
    value: "sage",
    label: "Sage",
    dotClass: "bg-[#cdddc9]",
  },
  {
    value: "sky",
    label: "Sky",
    dotClass: "bg-[#cfe0ea]",
  },
  {
    value: "lavender",
    label: "Lavender",
    dotClass: "bg-[#ddd4ea]",
  },
];


const NOTE_BACKGROUND: Record<
  QuickNoteColor,
  string
> = {
  cream: "bg-[#fffaf0]",
  blush: "bg-[#fff5f6]",
  sage: "bg-[#f5f9f3]",
  sky: "bg-[#f3f8fb]",
  lavender: "bg-[#f8f5fb]",
};


/* =========================================================
   Error helper

   Supabase/browser fetch 偶尔可能直接 reject 一个 Event。
   这里统一把未知错误转成可读文字，避免 Next dev overlay
   只显示 [object Event]。
========================================================= */

function describeUnknownError(
  value: unknown
) {
  if (value instanceof Error) {
    return value.message;
  }

  if (
    typeof Event !== "undefined" &&
    value instanceof Event
  ) {
    return value.type
      ? `browser event: ${value.type}`
      : "browser event";
  }

  if (typeof value === "string") {
    return value;
  }

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
  const [notes, setNotes] =
    useState<QuickNote[]>([]);

  const [
    loadedSubtasks,
    setLoadedSubtasks,
  ] =
    useState<QuickNotesSubtask[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null
    );

  /*
   * undefined = composer 关闭
   * null      = Unsorted composer
   * string    = 某个 subtask composer
   */
  const [
    composerSubtaskId,
    setComposerSubtaskId,
  ] =
    useState<
      string | null | undefined
    >(undefined);

  const [
    draftTitle,
    setDraftTitle,
  ] = useState("");

  const [
    draftContent,
    setDraftContent,
  ] = useState("");

  const [
    draftColor,
    setDraftColor,
  ] =
    useState<QuickNoteColor>(
      "cream"
    );

  const [
    editingId,
    setEditingId,
  ] =
    useState<string | null>(
      null
    );

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    editContent,
    setEditContent,
  ] = useState("");

  const [
    editColor,
    setEditColor,
  ] =
    useState<QuickNoteColor>(
      "cream"
    );

  const [
    deletingId,
    setDeletingId,
  ] =
    useState<string | null>(
      null
    );

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );


  /* =======================================================
     Load Quick Notes

     Notes 只在 todoId 改变时重新读取。

     左侧 Step 的新增 / 删除 / 排序不需要重新 fetch notes，
     因为父级会把最新 subtasks 直接传进来。
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
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

        if (cancelled) {
          return;
        }

        if (loadError) {
          setNotes([]);

          setError(
            "读取 Quick Notes 失败：" +
              loadError.message
          );

          return;
        }

        setNotes(
          (data ?? []) as QuickNote[]
        );
      } catch (unknownError) {
        if (cancelled) {
          return;
        }

        setNotes([]);

        setError(
          "打开 Quick Notes 时网络请求失败：" +
            describeUnknownError(
              unknownError
            )
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [todoId]);


  /* =======================================================
     Fallback load subtasks

     正常的 Today/Todo workspace 会把左侧最新 subtasks
     直接传进来。

     如果某个页面没有父级 shared state（例如未来 Calendar
     单独打开 QuickNotes），这里仍然会自己读取 todo_subtasks。
  ======================================================= */

  useEffect(() => {
    if (providedSubtasks) {
      return;
    }

    let cancelled = false;

    async function loadSubtasks() {
      try {
        const supabase =
          createClient();

        const {
          data,
          error: loadError,
        } =
          await supabase
            .from(
              "todo_subtasks"
            )
            .select(`
              id,
              title,
              sort_order
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

        if (cancelled) {
          return;
        }

        if (loadError) {
          setLoadedSubtasks([]);

          setError(
            "读取任务步骤失败：" +
              loadError.message
          );

          return;
        }

        setLoadedSubtasks(
          (data ?? []) as QuickNotesSubtask[]
        );
      } catch (unknownError) {
        if (cancelled) {
          return;
        }

        setLoadedSubtasks([]);

        setError(
          "读取任务步骤失败：" +
            describeUnknownError(
              unknownError
            )
        );
      }
    }

    void loadSubtasks();

    return () => {
      cancelled = true;
    };
  }, [
    todoId,
    providedSubtasks,
  ]);


  /*
   * 打开 composer 后自动把焦点放到内容输入框。
   */
  useEffect(() => {
    if (
      composerSubtaskId !==
      undefined
    ) {
      textareaRef.current?.focus();
    }
  }, [
    composerSubtaskId,
  ]);


  /* =======================================================
     Derived data
  ======================================================= */

  const subtasks =
    providedSubtasks ??
    loadedSubtasks;


  const sortedSubtasks =
    useMemo(
      () =>
        [...subtasks].sort(
          (a, b) =>
            a.sort_order -
            b.sort_order
        ),
      [subtasks]
    );


  /*
   * 当前仍存在的 Step id。
   *
   * 删除 Step 时，左侧 React state 会比数据库 FK 的
   * ON DELETE SET NULL 更快一步更新。
   *
   * 所以只要某个 Note 指向的 subtask 已经不存在，
   * UI 就先把它当作 Unsorted。这样右侧不会出现
   * “Step 消失了，但 Note 也暂时消失”的空档。
   */
  const validSubtaskIds =
    useMemo(
      () =>
        new Set(
          sortedSubtasks.map(
            (subtask) =>
              subtask.id
          )
        ),
      [sortedSubtasks]
    );


  const unsortedNotes =
    useMemo(
      () =>
        notes
          .filter(
            (note) =>
              note.subtask_id ===
                null ||
              !validSubtaskIds.has(
                note.subtask_id
              )
          )
          .sort(
            (a, b) =>
              a.sort_order -
              b.sort_order
          ),
      [
        notes,
        validSubtaskIds,
      ]
    );


  function notesForSubtask(
    subtaskId: string
  ) {
    return notes
      .filter(
        (note) =>
          note.subtask_id ===
          subtaskId
      )
      .sort(
        (a, b) =>
          a.sort_order -
          b.sort_order
      );
  }


  /*
   * 新增 Note 时使用间隔排序：
   * 1000, 2000, 3000...
   */
  function getNextSortOrder(
    subtaskId: string | null
  ) {
    const sectionNotes =
      notes.filter(
        (note) =>
          note.subtask_id ===
          subtaskId
      );

    if (
      sectionNotes.length === 0
    ) {
      return 1000;
    }

    return (
      Math.max(
        ...sectionNotes.map(
          (note) =>
            note.sort_order
        )
      ) + 1000
    );
  }


  /* =======================================================
     Drag-and-drop: same-section reorder

     当前版本只允许：
     - Unsorted 内排序
     - Step 01 内排序
     - Step 02 内排序

     暂时不允许跨 section。
  ======================================================= */

  async function reorderNotesWithinSection(
    sectionNotes: QuickNote[],
    activeId: string,
    overId: string
  ) {
    if (
      activeId === overId
    ) {
      return;
    }

    const oldIndex =
      sectionNotes.findIndex(
        (note) =>
          note.id ===
          activeId
      );

    const newIndex =
      sectionNotes.findIndex(
        (note) =>
          note.id ===
          overId
      );

    if (
      oldIndex < 0 ||
      newIndex < 0
    ) {
      return;
    }

    /*
     * 保留旧状态，保存失败时回滚。
     */
    const previous =
      notes;

    /*
     * 当前 section 内重新排序，并 normalize sort_order。
     */
    const reordered =
      arrayMove(
        sectionNotes,
        oldIndex,
        newIndex
      ).map(
        (
          note,
          index
        ) => ({
          ...note,
          sort_order:
            (index + 1) *
            1000,
        })
      );

    const reorderedMap =
      new Map(
        reordered.map(
          (note) => [
            note.id,
            note,
          ]
        )
      );

    /*
     * Optimistic UI：先立刻更新界面。
     */
    setNotes(
      (current) =>
        current.map(
          (note) =>
            reorderedMap.get(
              note.id
            ) ?? note
        )
    );

    setError(null);

    try {
      const supabase =
        createClient();

      const results =
        await Promise.all(
          reordered.map(
            (note) =>
              supabase
                .from(
                  "quick_notes"
                )
                .update({
                  sort_order:
                    note.sort_order,
                })
                .eq(
                  "id",
                  note.id
                )
          )
        );

      const saveError =
        results.find(
          (result) =>
            result.error
        )?.error;

      if (saveError) {
        setNotes(
          previous
        );

        setError(
          "保存 Note 顺序失败：" +
            saveError.message
        );
      }
    } catch (
      unknownError
    ) {
      setNotes(
        previous
      );

      setError(
        "保存 Note 顺序失败：" +
          describeUnknownError(
            unknownError
          )
      );
    }
  }


  /* =======================================================
     Composer
  ======================================================= */

  function openComposer(
    subtaskId: string | null
  ) {
    setEditingId(
      null
    );

    setDraftTitle(
      ""
    );

    setDraftContent(
      ""
    );

    setDraftColor(
      "cream"
    );

    setComposerSubtaskId(
      subtaskId
    );
  }


  function closeComposer() {
    setComposerSubtaskId(
      undefined
    );

    setDraftTitle(
      ""
    );

    setDraftContent(
      ""
    );

    setDraftColor(
      "cream"
    );
  }


  /* =======================================================
     Create
  ======================================================= */

  async function addNote() {
    const cleanContent =
      draftContent.trim();

    if (
      !cleanContent ||
      busy ||
      composerSubtaskId ===
        undefined
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase =
        createClient();

      const {
        data,
        error: insertError,
      } =
        await supabase
          .from(
            "quick_notes"
          )
          .insert({
            todo_id:
              todoId,

            subtask_id:
              composerSubtaskId,

            title:
              draftTitle.trim() ||
              null,

            content:
              cleanContent,

            color:
              draftColor,

            sort_order:
              getNextSortOrder(
                composerSubtaskId
              ),
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

      if (
        insertError ||
        !data
      ) {
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
        (current) => [
          ...current,
          data as QuickNote,
        ]
      );

      closeComposer();
    } catch (
      unknownError
    ) {
      setError(
        "新增 Quick Note 失败：" +
          describeUnknownError(
            unknownError
          )
      );
    } finally {
      setBusy(false);
    }
  }


  /* =======================================================
     Delete
  ======================================================= */

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
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            note.id
        )
    );

    setError(null);

    try {
      const supabase =
        createClient();

      const {
        error: deleteError,
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

      if (deleteError) {
        setNotes(
          previous
        );

        setError(
          "删除 Quick Note 失败：" +
            deleteError.message
        );
      }
    } catch (
      unknownError
    ) {
      setNotes(
        previous
      );

      setError(
        "删除 Quick Note 失败：" +
          describeUnknownError(
            unknownError
          )
      );
    } finally {
      setDeletingId(
        null
      );
    }
  }


  /* =======================================================
     Edit
  ======================================================= */

  function startEditing(
    note: QuickNote
  ) {
    closeComposer();

    setEditingId(
      note.id
    );

    setEditTitle(
      note.title ?? ""
    );

    setEditContent(
      note.content
    );

    setEditColor(
      note.color
    );
  }


  function cancelEditing() {
    setEditingId(
      null
    );

    setEditTitle(
      ""
    );

    setEditContent(
      ""
    );

    setEditColor(
      "cream"
    );
  }


  async function saveEdit(
    note: QuickNote
  ) {
    const cleanContent =
      editContent.trim();

    if (
      !cleanContent ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase =
        createClient();

      const {
        data,
        error: updateError,
      } =
        await supabase
          .from(
            "quick_notes"
          )
          .update({
            title:
              editTitle.trim() ||
              null,

            content:
              cleanContent,

            color:
              editColor,
          })
          .eq(
            "id",
            note.id
          )
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

      if (
        updateError ||
        !data
      ) {
        setError(
          "编辑 Quick Note 失败：" +
            (
              updateError
                ?.message ??
              "没有返回数据"
            )
        );

        return;
      }

      setNotes(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              note.id
                ? data as QuickNote
                : item
          )
      );

      cancelEditing();
    } catch (
      unknownError
    ) {
      setError(
        "编辑 Quick Note 失败：" +
          describeUnknownError(
            unknownError
          )
      );
    } finally {
      setBusy(false);
    }
  }


  /* =======================================================
     Move via dropdown

     现有 V1 的跨 section 移动方式。
     DnD 跨 section 后续再实现。
  ======================================================= */

  async function moveNote(
    note: QuickNote,
    destination:
      string | null
  ) {
    if (
      note.subtask_id ===
      destination
    ) {
      return;
    }

    const previous =
      notes;

    const nextSortOrder =
      getNextSortOrder(
        destination
      );

    setNotes(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            note.id
              ? {
                  ...item,

                  subtask_id:
                    destination,

                  sort_order:
                    nextSortOrder,
                }
              : item
        )
    );

    setError(null);

    try {
      const supabase =
        createClient();

      const {
        error: moveError,
      } =
        await supabase
          .from(
            "quick_notes"
          )
          .update({
            subtask_id:
              destination,

            sort_order:
              nextSortOrder,
          })
          .eq(
            "id",
            note.id
          );

      if (moveError) {
        setNotes(
          previous
        );

        setError(
          "移动 Quick Note 失败：" +
            moveError.message
        );
      }
    } catch (
      unknownError
    ) {
      setNotes(
        previous
      );

      setError(
        "移动 Quick Note 失败：" +
          describeUnknownError(
            unknownError
          )
      );
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
            onClick={
              onClose
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-faint transition hover:bg-paper hover:text-ink"
            aria-label="关闭 Quick Notes"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>


      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {loading ? (
          <p className="py-10 text-center text-xs text-ink-faint">
            正在读取 Notes…
          </p>
        ) : (
          <div className="space-y-5">
            <NoteSection
              title="Unsorted"
              stepLabel={null}
              notes={
                unsortedNotes
              }
              subtasks={
                sortedSubtasks
              }
              composerOpen={
                composerSubtaskId ===
                null
              }
              editingId={
                editingId
              }
              draftTitle={
                draftTitle
              }
              draftContent={
                draftContent
              }
              draftColor={
                draftColor
              }
              editTitle={
                editTitle
              }
              editContent={
                editContent
              }
              editColor={
                editColor
              }
              busy={
                busy
              }
              deletingId={
                deletingId
              }
              textareaRef={
                textareaRef
              }
              onOpenComposer={() =>
                openComposer(
                  null
                )
              }
              onCloseComposer={
                closeComposer
              }
              onDraftTitle={
                setDraftTitle
              }
              onDraftContent={
                setDraftContent
              }
              onDraftColor={
                setDraftColor
              }
              onAddNote={
                addNote
              }
              onStartEdit={
                startEditing
              }
              onCancelEdit={
                cancelEditing
              }
              onEditTitle={
                setEditTitle
              }
              onEditContent={
                setEditContent
              }
              onEditColor={
                setEditColor
              }
              onSaveEdit={
                saveEdit
              }
              onDelete={
                deleteNote
              }
              onMove={
                moveNote
              }
              onReorder={
                reorderNotesWithinSection
              }
            />


            {sortedSubtasks.map(
              (
                subtask,
                index
              ) => (
                <NoteSection
                  key={
                    subtask.id
                  }
                  title={
                    subtask.title
                  }
                  stepLabel={String(
                    index + 1
                  ).padStart(
                    2,
                    "0"
                  )}
                  notes={
                    notesForSubtask(
                      subtask.id
                    )
                  }
                  subtasks={
                    sortedSubtasks
                  }
                  composerOpen={
                    composerSubtaskId ===
                    subtask.id
                  }
                  editingId={
                    editingId
                  }
                  draftTitle={
                    draftTitle
                  }
                  draftContent={
                    draftContent
                  }
                  draftColor={
                    draftColor
                  }
                  editTitle={
                    editTitle
                  }
                  editContent={
                    editContent
                  }
                  editColor={
                    editColor
                  }
                  busy={
                    busy
                  }
                  deletingId={
                    deletingId
                  }
                  textareaRef={
                    textareaRef
                  }
                  onOpenComposer={() =>
                    openComposer(
                      subtask.id
                    )
                  }
                  onCloseComposer={
                    closeComposer
                  }
                  onDraftTitle={
                    setDraftTitle
                  }
                  onDraftContent={
                    setDraftContent
                  }
                  onDraftColor={
                    setDraftColor
                  }
                  onAddNote={
                    addNote
                  }
                  onStartEdit={
                    startEditing
                  }
                  onCancelEdit={
                    cancelEditing
                  }
                  onEditTitle={
                    setEditTitle
                  }
                  onEditContent={
                    setEditContent
                  }
                  onEditColor={
                    setEditColor
                  }
                  onSaveEdit={
                    saveEdit
                  }
                  onDelete={
                    deleteNote
                  }
                  onMove={
                    moveNote
                  }
                  onReorder={
                    reorderNotesWithinSection
                  }
                />
              )
            )}
          </div>
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
   Section
========================================================= */

type NoteSectionProps = {
  title: string;
  stepLabel:
    string | null;

  notes: QuickNote[];

  subtasks:
    QuickNotesSubtask[];

  composerOpen: boolean;

  editingId:
    string | null;

  draftTitle: string;
  draftContent: string;
  draftColor:
    QuickNoteColor;

  editTitle: string;
  editContent: string;
  editColor:
    QuickNoteColor;

  busy: boolean;

  deletingId:
    string | null;

  textareaRef:
    React.RefObject<
      HTMLTextAreaElement | null
    >;

  onOpenComposer:
    () => void;

  onCloseComposer:
    () => void;

  onDraftTitle:
    (value: string) => void;

  onDraftContent:
    (value: string) => void;

  onDraftColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onAddNote:
    () => Promise<void>;

  onStartEdit:
    (
      note:
        QuickNote
    ) => void;

  onCancelEdit:
    () => void;

  onEditTitle:
    (value: string) => void;

  onEditContent:
    (value: string) => void;

  onEditColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSaveEdit:
    (
      note:
        QuickNote
    ) => Promise<void>;

  onDelete:
    (
      note:
        QuickNote
    ) => Promise<void>;

  onMove:
    (
      note:
        QuickNote,

      destination:
        string | null
    ) => Promise<void>;

  onReorder:
    (
      sectionNotes:
        QuickNote[],

      activeId:
        string,

      overId:
        string
    ) => Promise<void>;
};


function NoteSection({
  title,
  stepLabel,
  notes,
  subtasks,
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
  onReorder,
}: NoteSectionProps) {
  /*
   * 每个 section 都有自己的 DndContext。
   * 所以这一版天然只允许同 section 排序。
   */
  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint: {
            distance: 6,
          },
        }
      )
    );


  function handleDragEnd(
    event:
      DragEndEvent
  ) {
    const {
      active,
      over,
    } = event;

    if (!over) {
      return;
    }

    if (
      active.id ===
      over.id
    ) {
      return;
    }

    void onReorder(
      notes,
      String(
        active.id
      ),
      String(
        over.id
      )
    );
  }


  return (
    <section>
      <div className="flex items-center gap-2 px-1">
        {stepLabel && (
          <span className="text-[10px] font-medium tabular-nums text-ink-faint">
            {stepLabel}
          </span>
        )}

        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-ink-soft">
          {title}
        </h3>

        <span className="text-[10px] tabular-nums text-ink-faint">
          {notes.length}
        </span>

        <button
          type="button"
          onClick={
            onOpenComposer
          }
          className="flex h-6 w-6 items-center justify-center rounded-lg text-ink-faint transition hover:bg-sage-50 hover:text-sage-700"
          aria-label={
            `Add note to ${title}`
          }
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>


      {composerOpen && (
        <NoteComposer
          textareaRef={
            textareaRef
          }
          title={
            draftTitle
          }
          content={
            draftContent
          }
          color={
            draftColor
          }
          busy={
            busy
          }
          onTitle={
            onDraftTitle
          }
          onContent={
            onDraftContent
          }
          onColor={
            onDraftColor
          }
          onSave={
            onAddNote
          }
          onCancel={
            onCloseComposer
          }
        />
      )}


      {notes.length > 0 && (
        <DndContext
          sensors={
            sensors
          }
          collisionDetection={
            closestCenter
          }
          onDragEnd={
            handleDragEnd
          }
        >
          <SortableContext
            items={
              notes.map(
                (note) =>
                  note.id
              )
            }
            strategy={
              verticalListSortingStrategy
            }
          >
            <div className="mt-2 space-y-2">
              {notes.map(
                (note) => (
                  <NoteCard
                    key={
                      note.id
                    }
                    note={
                      note
                    }
                    subtasks={
                      subtasks
                    }
                    editing={
                      editingId ===
                      note.id
                    }
                    editTitle={
                      editTitle
                    }
                    editContent={
                      editContent
                    }
                    editColor={
                      editColor
                    }
                    busy={
                      busy
                    }
                    deleting={
                      deletingId ===
                      note.id
                    }
                    onStartEdit={
                      onStartEdit
                    }
                    onCancelEdit={
                      onCancelEdit
                    }
                    onEditTitle={
                      onEditTitle
                    }
                    onEditContent={
                      onEditContent
                    }
                    onEditColor={
                      onEditColor
                    }
                    onSaveEdit={
                      onSaveEdit
                    }
                    onDelete={
                      onDelete
                    }
                    onMove={
                      onMove
                    }
                  />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
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
  textareaRef:
    React.RefObject<
      HTMLTextAreaElement | null
    >;

  title: string;
  content: string;
  color:
    QuickNoteColor;

  busy: boolean;

  onTitle:
    (value: string) => void;

  onContent:
    (value: string) => void;

  onColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSave:
    () => Promise<void>;

  onCancel:
    () => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-line/80 bg-white/80 p-3 shadow-sm">
      <input
        value={
          title
        }
        onChange={(
          event
        ) =>
          onTitle(
            event.target.value
          )
        }
        placeholder="Title (optional)"
        className="w-full bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-faint/75"
      />

      <textarea
        ref={
          textareaRef
        }
        value={
          content
        }
        onChange={(
          event
        ) =>
          onContent(
            event.target.value
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

            void onSave();
          }
        }}
        rows={3}
        placeholder="Write a note..."
        className="mt-2 w-full resize-none bg-transparent text-xs leading-5 text-ink-soft outline-none placeholder:text-ink-faint/75"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <ColorPicker
          value={
            color
          }
          onChange={
            onColor
          }
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              onCancel
            }
            className="rounded-lg px-2 py-1 text-[10px] text-ink-faint transition hover:bg-paper hover:text-ink-soft"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              busy ||
              !content.trim()
            }
            onClick={() =>
              void onSave()
            }
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
   Sortable Note Card

   只有 GripVertical 是拖拽 handle。
   Edit/Delete/Move 不会和拖拽抢 pointer event。
========================================================= */

function NoteCard({
  note,
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
  note:
    QuickNote;

  subtasks:
    QuickNotesSubtask[];

  editing:
    boolean;

  editTitle:
    string;

  editContent:
    string;

  editColor:
    QuickNoteColor;

  busy:
    boolean;

  deleting:
    boolean;

  onStartEdit:
    (
      note:
        QuickNote
    ) => void;

  onCancelEdit:
    () => void;

  onEditTitle:
    (value: string) => void;

  onEditContent:
    (value: string) => void;

  onEditColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSaveEdit:
    (
      note:
        QuickNote
    ) => Promise<void>;

  onDelete:
    (
      note:
        QuickNote
    ) => Promise<void>;

  onMove:
    (
      note:
        QuickNote,

      destination:
        string | null
    ) => Promise<void>;
}) {
  /*
   * 编辑状态时禁用拖拽，
   * 防止 textarea 操作与 DnD 冲突。
   */
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } =
    useSortable({
      id:
        note.id,

      disabled:
        editing,
    });


  const style = {
    transform:
      CSS.Transform.toString(
        transform
      ),

    transition,

    zIndex:
      isDragging
        ? 20
        : undefined,
  };


  if (editing) {
    return (
      <div
        ref={
          setNodeRef
        }
        style={
          style
        }
        className="rounded-2xl border border-line/80 bg-white/85 p-3 shadow-sm"
      >
        <input
          value={
            editTitle
          }
          onChange={(
            event
          ) =>
            onEditTitle(
              event.target.value
            )
          }
          placeholder="Title (optional)"
          className="w-full bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-faint/75"
        />

        <textarea
          value={
            editContent
          }
          onChange={(
            event
          ) =>
            onEditContent(
              event.target.value
            )
          }
          rows={4}
          className="mt-2 w-full resize-none bg-transparent text-xs leading-5 text-ink-soft outline-none"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <ColorPicker
            value={
              editColor
            }
            onChange={
              onEditColor
            }
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                onCancelEdit
              }
              className="rounded-lg px-2 py-1 text-[10px] text-ink-faint hover:bg-paper"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={
                busy ||
                !editContent.trim()
              }
              onClick={() =>
                void onSaveEdit(
                  note
                )
              }
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
      ref={
        setNodeRef
      }
      style={
        style
      }
      className={`group relative rounded-2xl border border-line/60 p-3.5 transition hover:-translate-y-px hover:shadow-sm ${
        NOTE_BACKGROUND[
          note.color
        ]
      } ${
        isDragging
          ? "opacity-60 shadow-lg"
          : ""
      }`}
    >
      <div className="flex items-start gap-2">
        {/* 只有这个按钮可以拖动 */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-ink-faint/60 transition hover:bg-white/70 hover:text-ink-soft active:cursor-grabbing"
          aria-label="拖动调整 Note 顺序"
          title="拖动调整顺序"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>


        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage-500/80" />


        <div className="min-w-0 flex-1">
          {note.title && (
            <p className="mb-1 text-xs font-medium text-ink">
              {note.title}
            </p>
          )}

          <p className="whitespace-pre-wrap text-xs leading-5 text-ink-soft">
            {note.content}
          </p>
        </div>


        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() =>
              onStartEdit(
                note
              )
            }
            className="rounded-md p-1 text-ink-faint transition hover:bg-white/70 hover:text-ink-soft"
            aria-label="Edit note"
          >
            <Pencil className="h-3 w-3" />
          </button>

          <button
            type="button"
            disabled={
              deleting
            }
            onClick={() =>
              void onDelete(
                note
              )
            }
            className="rounded-md p-1 text-ink-faint transition hover:bg-white/70 hover:text-blush-500 disabled:opacity-40"
            aria-label="Delete note"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>


      <div className="mt-3 flex items-center justify-end border-t border-black/[0.04] pt-2">
        <select
          value={
            note.subtask_id ??
            "__unsorted__"
          }
          onChange={(
            event
          ) => {
            const value =
              event.target.value;

            void onMove(
              note,

              value ===
                "__unsorted__"
                ? null
                : value
            );
          }}
          className="max-w-[180px] truncate rounded-lg border border-line/60 bg-white/55 px-2 py-1 text-[9px] text-ink-faint outline-none transition hover:bg-white"
          aria-label="Move note"
        >
          <option value="__unsorted__">
            Move to · Unsorted
          </option>

          {subtasks.map(
            (
              subtask
            ) => (
              <option
                key={
                  subtask.id
                }
                value={
                  subtask.id
                }
              >
                Move to ·{" "}
                {
                  subtask.title
                }
              </option>
            )
          )}
        </select>
      </div>
    </article>
  );
}


/* =========================================================
   Color picker
========================================================= */

function ColorPicker({
  value,
  onChange,
}: {
  value:
    QuickNoteColor;

  onChange:
    (
      value:
        QuickNoteColor
    ) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label="Note color"
    >
      {COLOR_OPTIONS.map(
        (
          option
        ) => (
          <button
            key={
              option.value
            }
            type="button"
            onClick={() =>
              onChange(
                option.value
              )
            }
            className={`h-5 w-5 rounded-full border transition ${
              option.dotClass
            } ${
              value ===
              option.value
                ? "border-sage-700 ring-2 ring-sage-100"
                : "border-black/5 hover:scale-110"
            }`}
            title={
              option.label
            }
            aria-label={
              option.label
            }
          />
        )
      )}
    </div>
  );
}
