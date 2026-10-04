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
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
   * 正常情况下，Todo Workspace 会把左侧最新的 subtasks
   * 直接传进来，因此左右两栏会即时同步。
   *
   * 如果父级没有传，QuickNotes 会自己从 Supabase 读取，
   * 方便 Calendar 等其他页面独立使用。
   */
  subtasks?: QuickNotesSubtask[];

  onClose?: () => void;

  /*
   * 预留给后续“打开 Notes 后自动滚动到某个 Step”。
   * 当前版本暂时不执行自动滚动。
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
   DnD helpers
========================================================= */

/*
 * section droppable id 统一加前缀，避免与 note UUID 冲突。
 */
const UNSORTED_SECTION_KEY =
  "__unsorted__";


function sectionDropId(
  subtaskId: string | null
) {
  return `section:${
    subtaskId ??
    UNSORTED_SECTION_KEY
  }`;
}


function subtaskIdFromSectionDropId(
  value: string
) {
  if (
    !value.startsWith(
      "section:"
    )
  ) {
    return undefined;
  }

  const raw =
    value.slice(
      "section:".length
    );

  return raw ===
    UNSORTED_SECTION_KEY
    ? null
    : raw;
}


/* =========================================================
   Error helper
========================================================= */

function describeUnknownError(
  value: unknown
) {
  if (
    value instanceof Error
  ) {
    return value.message;
  }

  if (
    typeof Event !==
      "undefined" &&
    value instanceof Event
  ) {
    return value.type
      ? `browser event: ${value.type}`
      : "browser event";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value
    );
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
  const [
    notes,
    setNotes,
  ] =
    useState<QuickNote[]>(
      []
    );

  const [
    loadedSubtasks,
    setLoadedSubtasks,
  ] =
    useState<
      QuickNotesSubtask[]
    >([]);

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
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

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
      string |
      null |
      undefined
    >(undefined);

  const [
    draftTitle,
    setDraftTitle,
  ] =
    useState("");

  const [
    draftContent,
    setDraftContent,
  ] =
    useState("");

  const [
    draftColor,
    setDraftColor,
  ] =
    useState<
      QuickNoteColor
    >("cream");

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    editTitle,
    setEditTitle,
  ] =
    useState("");

  const [
    editContent,
    setEditContent,
  ] =
    useState("");

  const [
    editColor,
    setEditColor,
  ] =
    useState<
      QuickNoteColor
    >("cream");

  const [
    deletingId,
    setDeletingId,
  ] =
    useState<
      string | null
    >(null);

  /*
   * 当前正在被拖动的 note。
   * 用于：
   * - DragOverlay
   * - section drop zone 的视觉状态
   */
  const [
    activeNoteId,
    setActiveNoteId,
  ] =
    useState<
      string | null
    >(null);

  const textareaRef =
    useRef<
      HTMLTextAreaElement |
      null
    >(null);


  /*
   * 整个 Quick Notes Panel 只使用一个 DndContext。
   * 这是实现跨 section 拖拽的关键。
   */
  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint:
            {
              distance: 6,
            },
        }
      )
    );


  /* =======================================================
     Load Quick Notes
  ======================================================= */

  useEffect(() => {
    let cancelled =
      false;

    async function loadNotes() {
      setLoading(true);
      setError(null);

      try {
        const supabase =
          createClient();

        const {
          data,
          error:
            loadError,
        } =
          await supabase
            .from(
              "quick_notes"
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
          (data ??
            []) as QuickNote[]
        );
      } catch (
        unknownError
      ) {
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
      cancelled =
        true;
    };
  }, [todoId]);


  /* =======================================================
     Fallback load subtasks
  ======================================================= */

  useEffect(() => {
    if (
      providedSubtasks
    ) {
      return;
    }

    let cancelled =
      false;

    async function loadSubtasks() {
      try {
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

        if (cancelled) {
          return;
        }

        if (loadError) {
          setLoadedSubtasks(
            []
          );

          setError(
            "读取任务步骤失败：" +
              loadError.message
          );

          return;
        }

        setLoadedSubtasks(
          (data ??
            []) as QuickNotesSubtask[]
        );
      } catch (
        unknownError
      ) {
        if (cancelled) {
          return;
        }

        setLoadedSubtasks(
          []
        );

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
      cancelled =
        true;
    };
  }, [
    todoId,
    providedSubtasks,
  ]);


  /*
   * 打开 composer 后自动聚焦内容输入框。
   */
  useEffect(() => {
    if (
      composerSubtaskId !==
      undefined
    ) {
      textareaRef.current
        ?.focus();
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


  const validSubtaskIds =
    useMemo(
      () =>
        new Set(
          sortedSubtasks.map(
            (subtask) =>
              subtask.id
          )
        ),
      [
        sortedSubtasks,
      ]
    );


  /*
   * 如果左侧刚删除了一个 Step，
   * 右侧会立刻把原属于它的 notes 视为 Unsorted。
   * 数据库的 ON DELETE SET NULL 会随后保持数据一致。
   */
  function effectiveSubtaskId(
    note: QuickNote
  ): string | null {
    if (
      note.subtask_id ===
      null
    ) {
      return null;
    }

    return validSubtaskIds.has(
      note.subtask_id
    )
      ? note.subtask_id
      : null;
  }


  const unsortedNotes =
    useMemo(
      () =>
        notes
          .filter(
            (note) => {
              if (
                note.subtask_id ===
                null
              ) {
                return true;
              }

              return !validSubtaskIds.has(
                note.subtask_id
              );
            }
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


  function notesForSection(
    subtaskId:
      string | null
  ) {
    if (
      subtaskId === null
    ) {
      return unsortedNotes;
    }

    return notesForSubtask(
      subtaskId
    );
  }


  function getNextSortOrder(
    subtaskId:
      string | null
  ) {
    const sectionNotes =
      notesForSection(
        subtaskId
      );

    if (
      sectionNotes.length ===
      0
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


  const activeNote =
    activeNoteId
      ? notes.find(
          (note) =>
            note.id ===
            activeNoteId
        ) ?? null
      : null;


  /* =======================================================
     DnD persistence helper

     这里统一保存“受影响的 notes”。
     同 section 排序只会更新 sort_order；
     跨 section 拖拽会同时更新 subtask_id + sort_order。
  ======================================================= */

  async function persistNoteLayout(
    previous:
      QuickNote[],
    nextNotes:
      QuickNote[],
    changedIds:
      Set<string>
  ) {
    setNotes(
      nextNotes
    );

    setError(null);

    try {
      const supabase =
        createClient();

      const changedNotes =
        nextNotes.filter(
          (note) =>
            changedIds.has(
              note.id
            )
        );

      const results =
        await Promise.all(
          changedNotes.map(
            (note) =>
              supabase
                .from(
                  "quick_notes"
                )
                .update({
                  subtask_id:
                    note.subtask_id,
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
          "保存 Note 位置失败：" +
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
        "保存 Note 位置失败：" +
          describeUnknownError(
            unknownError
          )
      );
    }
  }


  /* =======================================================
     Drag start
  ======================================================= */

  function handleDragStart(
    event:
      DragStartEvent
  ) {
    setActiveNoteId(
      String(
        event.active.id
      )
    );

    /*
     * 正在编辑某张 note 时不会启动拖拽，
     * 这里额外关闭 composer，避免 panel 同时出现太多交互状态。
     */
    closeComposer();
  }


  /* =======================================================
     Drag end

     支持：
     - 同 section 排序
     - Unsorted -> Step
     - Step -> Unsorted
     - Step A -> Step B
     - 拖到空 section
     - 拖到目标 section 某张 Note 上
  ======================================================= */

  function handleDragEnd(
    event:
      DragEndEvent
  ) {
    const {
      active,
      over,
    } = event;

    setActiveNoteId(
      null
    );

    if (!over) {
      return;
    }

    const activeId =
      String(
        active.id
      );

    const overId =
      String(
        over.id
      );

    const movingNote =
      notes.find(
        (note) =>
          note.id ===
          activeId
      );

    if (!movingNote) {
      return;
    }

    const sourceSubtaskId =
      effectiveSubtaskId(
        movingNote
      );


    /*
     * 目标有两种：
     *
     * 1. section droppable
     *    section:__unsorted__
     *    section:<uuid>
     *
     * 2. 某一张 note
     *    此时目标 section = 那张 note 所属 section
     */
    const directSectionId =
      subtaskIdFromSectionDropId(
        overId
      );

    const overNote =
      notes.find(
        (note) =>
          note.id ===
          overId
      );

    const destinationSubtaskId =
      directSectionId !==
      undefined
        ? directSectionId
        : overNote
          ? effectiveSubtaskId(
              overNote
            )
          : undefined;

    if (
      destinationSubtaskId ===
      undefined
    ) {
      return;
    }


    const previous =
      notes;


    /* -----------------------------------------------------
       Case A: 同 section 排序
    ----------------------------------------------------- */

    if (
      sourceSubtaskId ===
      destinationSubtaskId
    ) {
      const sectionNotes =
        notesForSection(
          sourceSubtaskId
        );

      const oldIndex =
        sectionNotes.findIndex(
          (note) =>
            note.id ===
            activeId
        );

      if (
        oldIndex < 0
      ) {
        return;
      }

      /*
       * 如果直接拖到 section 空白区域，
       * 代表移动到 section 最后。
       */
      let newIndex =
        overNote
          ? sectionNotes.findIndex(
              (note) =>
                note.id ===
                overNote.id
            )
          : sectionNotes.length -
            1;

      if (
        newIndex < 0
      ) {
        newIndex =
          sectionNotes.length -
          1;
      }

      if (
        oldIndex ===
        newIndex
      ) {
        return;
      }

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
            subtask_id:
              sourceSubtaskId,
            sort_order:
              (index + 1) *
              1000,
          })
        );

      const patchMap =
        new Map(
          reordered.map(
            (note) => [
              note.id,
              note,
            ]
          )
        );

      const nextNotes =
        previous.map(
          (note) =>
            patchMap.get(
              note.id
            ) ??
            note
        );

      const changedIds =
        new Set(
          reordered.map(
            (note) =>
              note.id
          )
        );

      void persistNoteLayout(
        previous,
        nextNotes,
        changedIds
      );

      return;
    }


    /* -----------------------------------------------------
       Case B: 跨 section 移动
    ----------------------------------------------------- */

    const sourceNotes =
      notesForSection(
        sourceSubtaskId
      ).filter(
        (note) =>
          note.id !==
          activeId
      );

    const destinationNotes =
      notesForSection(
        destinationSubtaskId
      ).filter(
        (note) =>
          note.id !==
          activeId
      );


    /*
     * 如果拖到目标 section 某张 note 上，
     * 插到它前面。
     *
     * 如果拖到 section 空白区域，
     * 就追加到最后。
     */
    let insertIndex =
      destinationNotes.length;

    if (overNote) {
      const index =
        destinationNotes.findIndex(
          (note) =>
            note.id ===
            overNote.id
        );

      if (
        index >= 0
      ) {
        insertIndex =
          index;
      }
    }


    const movedNote: QuickNote =
      {
        ...movingNote,
        subtask_id:
          destinationSubtaskId,
      };


    const nextDestination =
      [
        ...destinationNotes.slice(
          0,
          insertIndex
        ),
        movedNote,
        ...destinationNotes.slice(
          insertIndex
        ),
      ].map(
        (
          note,
          index
        ) => ({
          ...note,
          subtask_id:
            destinationSubtaskId,
          sort_order:
            (index + 1) *
            1000,
        })
      );


    /*
     * 源 section 也重新 normalize，
     * 避免留下不必要的大间隔或重复顺序。
     */
    const nextSource =
      sourceNotes.map(
        (
          note,
          index
        ) => ({
          ...note,
          subtask_id:
            sourceSubtaskId,
          sort_order:
            (index + 1) *
            1000,
        })
      );


    const patchMap =
      new Map(
        [
          ...nextSource,
          ...nextDestination,
        ].map(
          (note) => [
            note.id,
            note,
          ]
        )
      );


    const nextNotes =
      previous.map(
        (note) =>
          patchMap.get(
            note.id
          ) ??
          note
      );


    const changedIds =
      new Set(
        [
          ...nextSource,
          ...nextDestination,
        ].map(
          (note) =>
            note.id
        )
      );


    void persistNoteLayout(
      previous,
      nextNotes,
      changedIds
    );
  }


  function handleDragCancel() {
    setActiveNoteId(
      null
    );
  }


  /* =======================================================
     Composer
  ======================================================= */

  function openComposer(
    subtaskId:
      string | null
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
      note.title ??
      ""
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
        error:
          updateError,
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
     Move dropdown

     保留 Move to... 作为备用方式。
     即使 DnD 已经支持跨 section，
     dropdown 仍然对键盘 / 精准移动很有用。
  ======================================================= */

  async function moveNote(
    note: QuickNote,
    destination:
      string | null
  ) {
    const currentSection =
      effectiveSubtaskId(
        note
      );

    if (
      currentSection ===
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

    const optimistic =
      notes.map(
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
      );

    setNotes(
      optimistic
    );

    setError(null);

    try {
      const supabase =
        createClient();

      const {
        error:
          moveError,
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

      if (
        moveError
      ) {
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
      {/* Header */}
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


      {/* Scrollable panel */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {loading ? (
          <p className="py-10 text-center text-xs text-ink-faint">
            正在读取 Notes…
          </p>
        ) : (
          /*
           * 注意：
           * DndContext 必须包住所有 section，
           * 才能让 Note 从一个 Step 拖到另一个 Step。
           */
          <DndContext
            sensors={
              sensors
            }
            collisionDetection={
              closestCenter
            }
            onDragStart={
              handleDragStart
            }
            onDragEnd={
              handleDragEnd
            }
            onDragCancel={
              handleDragCancel
            }
          >
            <div className="space-y-5">
              {/* Unsorted */}
              <NoteSection
                title="Unsorted"
                stepLabel={null}
                subtaskId={
                  null
                }
                notes={
                  unsortedNotes
                }
                subtasks={
                  sortedSubtasks
                }
                dragging={
                  Boolean(
                    activeNoteId
                  )
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
                effectiveSubtaskId={
                  null
                }
              />


              {/* One section per Step */}
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
                    subtaskId={
                      subtask.id
                    }
                    notes={
                      notesForSubtask(
                        subtask.id
                      )
                    }
                    subtasks={
                      sortedSubtasks
                    }
                    dragging={
                      Boolean(
                        activeNoteId
                      )
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
                    effectiveSubtaskId={
                      subtask.id
                    }
                  />
                )
              )}
            </div>


            {/* Dragging floating preview */}
            <DragOverlay>
              {activeNote ? (
                <DragPreview
                  note={
                    activeNote
                  }
                />
              ) : null}
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
   Section
========================================================= */

type NoteSectionProps = {
  title: string;
  stepLabel:
    string | null;

  /*
   * null = Unsorted
   * UUID = concrete subtask
   */
  subtaskId:
    string | null;

  notes:
    QuickNote[];

  subtasks:
    QuickNotesSubtask[];

  /*
   * 只在正在拖 Note 时显示 drop UI。
   */
  dragging:
    boolean;

  composerOpen:
    boolean;

  editingId:
    string | null;

  draftTitle:
    string;

  draftContent:
    string;

  draftColor:
    QuickNoteColor;

  editTitle:
    string;

  editContent:
    string;

  editColor:
    QuickNoteColor;

  busy:
    boolean;

  deletingId:
    string | null;

  textareaRef:
    React.RefObject<
      HTMLTextAreaElement |
      null
    >;

  onOpenComposer:
    () => void;

  onCloseComposer:
    () => void;

  onDraftTitle:
    (value: string) =>
      void;

  onDraftContent:
    (value: string) =>
      void;

  onDraftColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onAddNote:
    () =>
      Promise<void>;

  onStartEdit:
    (
      note:
        QuickNote
    ) => void;

  onCancelEdit:
    () => void;

  onEditTitle:
    (value: string) =>
      void;

  onEditContent:
    (value: string) =>
      void;

  onEditColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSaveEdit:
    (
      note:
        QuickNote
    ) =>
      Promise<void>;

  onDelete:
    (
      note:
        QuickNote
    ) =>
      Promise<void>;

  onMove:
    (
      note:
        QuickNote,
      destination:
        string | null
    ) =>
      Promise<void>;

  /*
   * 传给 NoteCard 作为 select 的当前真实 section。
   */
  effectiveSubtaskId:
    string | null;
};


function NoteSection({
  title,
  stepLabel,
  subtaskId,
  notes,
  subtasks,
  dragging,
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
  effectiveSubtaskId,
}: NoteSectionProps) {
  /*
   * 整个 section 都是 droppable。
   * 因此即使 section 里一张 Note 都没有，
   * 也可以直接把 Note 拖进来。
   */
  const {
    setNodeRef,
    isOver,
  } =
    useDroppable({
      id:
        sectionDropId(
          subtaskId
        ),

      data: {
        type:
          "note-section",
        subtaskId,
      },
    });


  return (
    <section
      ref={
        setNodeRef
      }
      className={`rounded-2xl transition ${
        isOver &&
        dragging
          ? "bg-sage-50/70 ring-1 ring-sage-300/70"
          : ""
      }`}
    >
      {/* Section header */}
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


      {/* Inline composer */}
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


      {/* Sortable Notes */}
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
        <div
          className={`mt-2 space-y-2 ${
            dragging
              ? "min-h-10"
              : ""
          }`}
        >
          {notes.map(
            (note) => (
              <NoteCard
                key={
                  note.id
                }
                note={
                  note
                }
                currentSubtaskId={
                  effectiveSubtaskId
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


          {/*
           * 平时不展示“空状态大盒子”。
           * 只有拖拽进行中并且当前 section 没有 notes 时，
           * 才显示一个轻量 drop target。
           */}
          {dragging &&
            notes.length ===
              0 && (
            <div
              className={`flex h-12 items-center justify-center rounded-xl border border-dashed text-[10px] transition ${
                isOver
                  ? "border-sage-500 bg-white/80 text-sage-700"
                  : "border-line/80 bg-white/35 text-ink-faint"
              }`}
            >
              Drop note here
            </div>
          )}
        </div>
      </SortableContext>
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
      HTMLTextAreaElement |
      null
    >;

  title: string;
  content: string;

  color:
    QuickNoteColor;

  busy:
    boolean;

  onTitle:
    (value: string) =>
      void;

  onContent:
    (value: string) =>
      void;

  onColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSave:
    () =>
      Promise<void>;

  onCancel:
    () =>
      void;
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

   只有左上角 GripVertical 是拖拽 handle。
   Edit / Delete / Move dropdown 都不会抢拖拽事件。
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
  note:
    QuickNote;

  currentSubtaskId:
    string | null;

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
    () =>
      void;

  onEditTitle:
    (value: string) =>
      void;

  onEditContent:
    (value: string) =>
      void;

  onEditColor:
    (
      value:
        QuickNoteColor
    ) => void;

  onSaveEdit:
    (
      note:
        QuickNote
    ) =>
      Promise<void>;

  onDelete:
    (
      note:
        QuickNote
    ) =>
      Promise<void>;

  onMove:
    (
      note:
        QuickNote,
      destination:
        string | null
    ) =>
      Promise<void>;
}) {
  /*
   * 编辑状态下禁用 DnD，
   * 防止 textarea 输入时误触拖拽。
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

      data: {
        type:
          "quick-note",
        subtaskId:
          currentSubtaskId,
      },
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
      className={`group relative rounded-2xl border border-line/60 p-3.5 transition ${
        NOTE_BACKGROUND[
          note.color
        ]
      } ${
        isDragging
          ? "opacity-25"
          : "hover:-translate-y-px hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Dedicated drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg border border-transparent text-ink-faint/55 transition hover:border-line/70 hover:bg-white/80 hover:text-sage-700 active:cursor-grabbing"
          aria-label="拖动 Note"
          title="拖动排序或移动到其他 Step"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>


        <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-sage-500/80" />


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


      {/* Keep dropdown as fallback / accessibility-friendly move */}
      <div className="mt-3 flex items-center justify-end border-t border-black/[0.04] pt-2">
        <select
          value={
            currentSubtaskId ??
            UNSORTED_SECTION_KEY
          }
          onChange={(
            event
          ) => {
            const value =
              event.target.value;

            void onMove(
              note,

              value ===
                UNSORTED_SECTION_KEY
                ? null
                : value
            );
          }}
          className="max-w-[180px] truncate rounded-lg border border-line/60 bg-white/55 px-2 py-1 text-[9px] text-ink-faint outline-none transition hover:bg-white"
          aria-label="Move note"
        >
          <option
            value={
              UNSORTED_SECTION_KEY
            }
          >
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
   Drag overlay preview
========================================================= */

function DragPreview({
  note,
}: {
  note:
    QuickNote;
}) {
  return (
    <div
      className={`w-[320px] max-w-[80vw] rotate-[1deg] rounded-2xl border border-sage-300/70 p-3.5 shadow-[0_18px_45px_rgba(60,50,40,0.18)] ${
        NOTE_BACKGROUND[
          note.color
        ]
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/60 text-sage-700">
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-sage-500/80" />

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
