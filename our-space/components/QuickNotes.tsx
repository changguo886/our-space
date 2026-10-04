"use client";

import {
  FileText,
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

import { createClient } from "@/lib/supabase/client";


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

  subtasks: QuickNotesSubtask[];

  onClose?: () => void;
};


const COLOR_OPTIONS: {
  value: QuickNoteColor;
  label: string;
}[] = [
  {
    value: "cream",
    label: "Cream",
  },
  {
    value: "blush",
    label: "Blush",
  },
  {
    value: "sage",
    label: "Sage",
  },
  {
    value: "sky",
    label: "Sky",
  },
  {
    value: "lavender",
    label: "Lavender",
  },
];


export default function QuickNotes({
  todoId,
  todoTitle,
  subtasks,
  onClose,
}: QuickNotesProps) {
  const [notes, setNotes] =
    useState<QuickNote[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    composerSubtaskId,
    setComposerSubtaskId,
  ] = useState<string | null | undefined>(
    undefined
  );

  const [draftTitle, setDraftTitle] =
    useState("");

  const [draftContent, setDraftContent] =
    useState("");

  const [draftColor, setDraftColor] =
    useState<QuickNoteColor>("cream");

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editTitle, setEditTitle] =
    useState("");

  const [editContent, setEditContent] =
    useState("");

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );


  useEffect(() => {
    void loadNotes();
  }, [todoId]);


  useEffect(() => {
    if (
      composerSubtaskId !== undefined &&
      textareaRef.current
    ) {
      textareaRef.current.focus();
    }
  }, [composerSubtaskId]);


  /*
   * Load ALL notes belonging to this Todo.
   *
   * Important:
   * We do NOT filter by subtask here anymore.
   * The panel needs all sections at once.
   */
  async function loadNotes() {
    setLoading(true);
    setError(null);

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
        .eq("todo_id", todoId)
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

    setLoading(false);

    if (loadError) {
      setError(
        "读取 Quick Notes 失败：" +
          loadError.message
      );

      return;
    }

    setNotes(
      (data ?? []) as QuickNote[]
    );
  }


  /*
   * Notes belonging to Unsorted.
   */
  const unsortedNotes =
    useMemo(
      () =>
        notes
          .filter(
            (note) =>
              note.subtask_id === null
          )
          .sort(
            (a, b) =>
              a.sort_order -
              b.sort_order
          ),
      [notes]
    );


  /*
   * Keep Subtasks ordered according
   * to todo_subtasks.sort_order.
   */
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
   * 1000 / 2000 / 3000 ...
   *
   * This makes later drag-and-drop
   * substantially easier.
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


  function openComposer(
    subtaskId: string | null
  ) {
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("cream");

    setComposerSubtaskId(
      subtaskId
    );
  }


  function closeComposer() {
    setComposerSubtaskId(
      undefined
    );

    setDraftTitle("");
    setDraftContent("");
    setDraftColor("cream");
  }


  async function addNote() {
    const cleanTitle =
      draftTitle.trim();

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

    const sortOrder =
      getNextSortOrder(
        composerSubtaskId
      );

    const supabase =
      createClient();

    const {
      data,
      error: insertError,
    } =
      await supabase
        .from("quick_notes")
        .insert({
          todo_id: todoId,

          subtask_id:
            composerSubtaskId,

          title:
            cleanTitle ||
            null,

          content:
            cleanContent,

          color:
            draftColor,

          sort_order:
            sortOrder,
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

    setBusy(false);

    if (
      insertError ||
      !data
    ) {
      setError(
        "新增 Quick Note 失败：" +
          (
            insertError?.message ??
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
  }


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
            item.id !== note.id
        )
    );

    const supabase =
      createClient();

    const {
      error: deleteError,
    } =
      await supabase
        .from("quick_notes")
        .delete()
        .eq(
          "id",
          note.id
        );

    setDeletingId(null);

    if (deleteError) {
      setNotes(previous);

      setError(
        "删除 Quick Note 失败：" +
          deleteError.message
      );
    }
  }


  function startEditing(
    note: QuickNote
  ) {
    setEditingId(note.id);

    setEditTitle(
      note.title ?? ""
    );

    setEditContent(
      note.content
    );
  }


  function cancelEditing() {
    setEditingId(null);

    setEditTitle("");
    setEditContent("");
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

    const supabase =
      createClient();

    const {
      data,
      error: updateError,
    } =
      await supabase
        .from("quick_notes")
        .update({
          title:
            editTitle.trim() ||
            null,

          content:
            cleanContent,
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

    setBusy(false);

    if (
      updateError ||
      !data
    ) {
      setError(
        "编辑 Quick Note 失败：" +
          (
            updateError?.message ??
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
  }


  /*
   * Move to another Subtask
   * or back to Unsorted.
   */
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

    const sortOrder =
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
                    sortOrder,
                }
              : item
        )
    );

    const supabase =
      createClient();

    const {
      error: moveError,
    } =
      await supabase
        .from("quick_notes")
        .update({
          subtask_id:
            destination,

          sort_order:
            sortOrder,
        })
        .eq(
          "id",
          note.id
        );

    if (moveError) {
      setNotes(previous);

      setError(
        "移动 Quick Note 失败：" +
          moveError.message
      );
    }
  }


  return (
    <aside
      className="
        flex
        h-full
        min-h-0
        min-w-0
        flex-col
        border-l
        border-line/70
        bg-white/60
        backdrop-blur-sm
      "
    >
      {/* Header */}
      <div
        className="
          flex
          shrink-0
          items-start
          justify-between
          gap-4
          border-b
          border-line/70
          px-5
          py-4
        "
      >
        <div className="min-w-0">
          <p
            className="
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.14em]
              text-ink-faint
            "
          >
            Quick Notes
          </p>

          {todoTitle && (
            <p
              className="
                mt-1
                truncate
                text-sm
                font-medium
                text-ink
              "
            >
              {todoTitle}
            </p>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="
              flex
              h-8
              w-8
              shrink-0
              items-center
              justify-center
              rounded-xl
              text-ink-faint
              transition
              hover:bg-paper
              hover:text-ink
            "
            aria-label="Close Quick Notes"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>


      {/* Global New Note */}
      <div
        className="
          shrink-0
          px-4
          pt-4
        "
      >
        <button
          type="button"
          onClick={() =>
            openComposer(null)
          }
          className="
            flex
            w-full
            items-center
            justify-center
            gap-2
            rounded-xl
            border
            border-dashed
            border-line
            px-3
            py-2.5
            text-xs
            font-medium
            text-ink-faint
            transition
            hover:border-sage-300
            hover:bg-sage-100/25
            hover:text-sage-700
          "
        >
          <Plus className="h-3.5 w-3.5" />

          New note
        </button>
      </div>


      {/* Scrollable body */}
      <div
        className="
          min-h-0
          flex-1
          overflow-y-auto
          px-4
          pb-8
          pt-4
        "
      >
        {loading ? (
          <p
            className="
              py-10
              text-center
              text-xs
              text-ink-faint
            "
          >
            正在读取 Notes…
          </p>
        ) : (
          <div className="space-y-6">

            {/* Unsorted */}
            <NoteSection
              title="Unsorted"
              notes={
                unsortedNotes
              }
              subtasks={
                sortedSubtasks
              }
              editingId={
                editingId
              }
              editTitle={
                editTitle
              }
              editContent={
                editContent
              }
              busy={busy}
              deletingId={
                deletingId
              }
              onEditTitle={
                setEditTitle
              }
              onEditContent={
                setEditContent
              }
              onStartEdit={
                startEditing
              }
              onCancelEdit={
                cancelEditing
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
              onAdd={() =>
                openComposer(null)
              }
            />


            {sortedSubtasks.map(
              (subtask) => (
                <NoteSection
                  key={
                    subtask.id
                  }
                  title={
                    subtask.title
                  }
                  notes={notesForSubtask(
                    subtask.id
                  )}
                  subtasks={
                    sortedSubtasks
                  }
                  editingId={
                    editingId
                  }
                  editTitle={
                    editTitle
                  }
                  editContent={
                    editContent
                  }
                  busy={busy}
                  deletingId={
                    deletingId
                  }
                  onEditTitle={
                    setEditTitle
                  }
                  onEditContent={
                    setEditContent
                  }
                  onStartEdit={
                    startEditing
                  }
                  onCancelEdit={
                    cancelEditing
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
                  onAdd={() =>
                    openComposer(
                      subtask.id
                    )
                  }
                />
              )
            )}

          </div>
        )}


        {/* Composer */}
        {composerSubtaskId !==
          undefined && (
          <div
            className="
              mt-5
              rounded-2xl
              border
              border-line
              bg-paper/75
              p-3
              shadow-sm
            "
          >
            <input
              value={
                draftTitle
              }
              onChange={(
                event
              ) =>
                setDraftTitle(
                  event.target
                    .value
                )
              }
              placeholder="Title (optional)"
              className="
                mb-2
                w-full
                bg-transparent
                text-sm
                font-medium
                text-ink
                outline-none
                placeholder:text-ink-faint
              "
            />

            <textarea
              ref={
                textareaRef
              }
              value={
                draftContent
              }
              onChange={(
                event
              ) =>
                setDraftContent(
                  event.target
                    .value
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

                  void addNote();
                }
              }}
              rows={4}
              placeholder="Write something..."
              className="
                w-full
                resize-none
                bg-transparent
                text-xs
                leading-5
                text-ink
                outline-none
                placeholder:text-ink-faint
              "
            />


            <div
              className="
                mt-3
                flex
                items-center
                justify-between
                gap-3
              "
            >
              <select
                value={
                  draftColor
                }
                onChange={(
                  event
                ) =>
                  setDraftColor(
                    event.target
                      .value as QuickNoteColor
                  )
                }
                className="
                  rounded-lg
                  border
                  border-line
                  bg-white/70
                  px-2
                  py-1
                  text-[10px]
                  text-ink-soft
                  outline-none
                "
              >
                {COLOR_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {
                        option.label
                      }
                    </option>
                  )
                )}
              </select>


              <div
                className="
                  flex
                  items-center
                  gap-2
                "
              >
                <button
                  type="button"
                  onClick={
                    closeComposer
                  }
                  className="
                    rounded-lg
                    px-2
                    py-1
                    text-[10px]
                    text-ink-faint
                    transition
                    hover:bg-white
                    hover:text-ink-soft
                  "
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    busy ||
                    !draftContent.trim()
                  }
                  onClick={() =>
                    void addNote()
                  }
                  className="
                    inline-flex
                    h-7
                    items-center
                    gap-1.5
                    rounded-lg
                    bg-sage-100
                    px-2.5
                    text-[10px]
                    font-medium
                    text-sage-700
                    transition
                    hover:bg-sage-300/60
                    disabled:opacity-40
                  "
                >
                  <Save className="h-3 w-3" />

                  Save
                </button>
              </div>
            </div>
          </div>
        )}


        {error && (
          <p
            className="
              mt-4
              text-xs
              text-blush-500
            "
          >
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}



type NoteSectionProps = {
  title: string;

  notes: QuickNote[];

  subtasks: QuickNotesSubtask[];

  editingId: string | null;

  editTitle: string;

  editContent: string;

  busy: boolean;

  deletingId: string | null;

  onEditTitle:
    (value: string) => void;

  onEditContent:
    (value: string) => void;

  onStartEdit:
    (note: QuickNote) => void;

  onCancelEdit:
    () => void;

  onSaveEdit:
    (note: QuickNote) =>
      Promise<void>;

  onDelete:
    (note: QuickNote) =>
      Promise<void>;

  onMove:
    (
      note: QuickNote,
      destination:
        string | null
    ) => Promise<void>;

  onAdd:
    () => void;
};


function NoteSection({
  title,
  notes,
  subtasks,
  editingId,
  editTitle,
  editContent,
  busy,
  deletingId,
  onEditTitle,
  onEditContent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMove,
  onAdd,
}: NoteSectionProps) {
  return (
    <section>

      {/* Section title */}
      <div
        className="
          mb-2
          flex
          items-center
          justify-between
          gap-3
        "
      >
        <div
          className="
            flex
            min-w-0
            items-center
            gap-2
          "
        >
          <p
            className="
              truncate
              text-[11px]
              font-semibold
              text-ink-soft
            "
          >
            {title}
          </p>

          <span
            className="
              rounded-full
              bg-paper
              px-1.5
              py-0.5
              text-[9px]
              text-ink-faint
            "
          >
            {notes.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="
            flex
            h-6
            w-6
            items-center
            justify-center
            rounded-lg
            text-ink-faint
            transition
            hover:bg-paper
            hover:text-sage-700
          "
          aria-label={`Add note to ${title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>


      {notes.length === 0 ? (
        <div
          className="
            rounded-xl
            border
            border-dashed
            border-line/60
            px-3
            py-3
            text-[10px]
            text-ink-faint
          "
        >
          No notes
        </div>
      ) : (
        <div className="space-y-2">
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
                busy={
                  busy
                }
                deleting={
                  deletingId ===
                  note.id
                }
                onEditTitle={
                  onEditTitle
                }
                onEditContent={
                  onEditContent
                }
                onStartEdit={
                  onStartEdit
                }
                onCancelEdit={
                  onCancelEdit
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
      )}
    </section>
  );
}



function NoteCard({
  note,
  subtasks,
  editing,
  editTitle,
  editContent,
  busy,
  deleting,
  onEditTitle,
  onEditContent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMove,
}: {
  note: QuickNote;

  subtasks: QuickNotesSubtask[];

  editing: boolean;

  editTitle: string;

  editContent: string;

  busy: boolean;

  deleting: boolean;

  onEditTitle:
    (value: string) => void;

  onEditContent:
    (value: string) => void;

  onStartEdit:
    (note: QuickNote) => void;

  onCancelEdit:
    () => void;

  onSaveEdit:
    (note: QuickNote) =>
      Promise<void>;

  onDelete:
    (note: QuickNote) =>
      Promise<void>;

  onMove:
    (
      note: QuickNote,
      destination:
        string | null
    ) => Promise<void>;
}) {
  const background =
    {
      cream:
        "bg-[#fffaf0]",

      blush:
        "bg-[#fff4f5]",

      sage:
        "bg-[#f4f8f3]",

      sky:
        "bg-[#f2f8fb]",

      lavender:
        "bg-[#f7f4fb]",
    }[note.color] ??
    "bg-paper/60";


  return (
    <article
      className={`
        group
        rounded-xl
        border
        border-line/65
        p-3
        transition
        ${background}
      `}
    >
      {editing ? (
        <>
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
            placeholder="Title"
            className="
              mb-2
              w-full
              bg-transparent
              text-xs
              font-medium
              text-ink
              outline-none
            "
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
            className="
              w-full
              resize-none
              bg-transparent
              text-xs
              leading-5
              text-ink-soft
              outline-none
            "
          />

          <div
            className="
              mt-2
              flex
              justify-end
              gap-2
            "
          >
            <button
              type="button"
              onClick={
                onCancelEdit
              }
              className="
                rounded-lg
                px-2
                py-1
                text-[10px]
                text-ink-faint
                hover:bg-white/70
              "
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
              className="
                inline-flex
                items-center
                gap-1
                rounded-lg
                bg-white/75
                px-2
                py-1
                text-[10px]
                font-medium
                text-sage-700
                disabled:opacity-40
              "
            >
              <Save className="h-3 w-3" />

              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="
              flex
              items-start
              gap-2.5
            "
          >
            <FileText
              className="
                mt-0.5
                h-3.5
                w-3.5
                shrink-0
                text-sage-500
              "
            />

            <div
              className="
                min-w-0
                flex-1
              "
            >
              {note.title && (
                <p
                  className="
                    mb-1
                    truncate
                    text-xs
                    font-medium
                    text-ink
                  "
                >
                  {note.title}
                </p>
              )}

              <p
                className="
                  line-clamp-3
                  whitespace-pre-wrap
                  text-xs
                  leading-5
                  text-ink-soft
                "
              >
                {note.content}
              </p>
            </div>


            <div
              className="
                flex
                shrink-0
                items-center
                gap-1
                opacity-0
                transition
                group-hover:opacity-100
              "
            >
              <button
                type="button"
                onClick={() =>
                  onStartEdit(
                    note
                  )
                }
                className="
                  rounded-md
                  p-1
                  text-ink-faint
                  hover:bg-white/70
                  hover:text-ink-soft
                "
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
                className="
                  rounded-md
                  p-1
                  text-ink-faint
                  hover:bg-white/70
                  hover:text-blush-500
                  disabled:opacity-40
                "
                aria-label="Delete note"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>


          {/* Move to */}
          <div
            className="
              mt-3
              flex
              items-center
              justify-between
              gap-2
              border-t
              border-line/40
              pt-2
            "
          >
            <span
              className="
                text-[9px]
                text-ink-faint
              "
            >
              Move to
            </span>

            <select
              value={
                note.subtask_id ??
                "__unsorted__"
              }
              onChange={(
                event
              ) => {
                const value =
                  event.target
                    .value;

                void onMove(
                  note,
                  value ===
                    "__unsorted__"
                    ? null
                    : value
                );
              }}
              className="
                max-w-[160px]
                truncate
                rounded-md
                border
                border-line/60
                bg-white/60
                px-1.5
                py-1
                text-[9px]
                text-ink-soft
                outline-none
              "
            >
              <option
                value="__unsorted__"
              >
                Unsorted
              </option>

              {subtasks.map(
                (subtask) => (
                  <option
                    key={
                      subtask.id
                    }
                    value={
                      subtask.id
                    }
                  >
                    {
                      subtask.title
                    }
                  </option>
                )
              )}
            </select>
          </div>
        </>
      )}
    </article>
  );
}