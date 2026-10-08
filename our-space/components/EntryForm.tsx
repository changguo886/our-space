"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Check,
  ImagePlus,
  NotebookText,
  PenLine,
  Send,
  Trash2,
  Upload,
  Video,
} from "lucide-react";

import { useRouter } from "next/navigation";

import { useI18n } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";

type Fields = {
  today_tasks: string;
  today_note: string;
  tomorrow_plan: string;
};

type MediaSection =
  keyof Fields;

export type ExistingEntryMedia = {
  id: string;
  media_type:
    | "image"
    | "video";
  section: MediaSection;
  storage_path: string;
  signed_url: string;
  sort_order: number;
};

type PendingMedia = {
  id: string;
  file: File;
  mediaType:
    | "image"
    | "video";
  section: MediaSection;
  previewUrl: string;
};

const QUESTIONS: {
  key: MediaSection;
  labelKey:
    | "todayTasks"
    | "todayNote"
    | "tomorrowPlan";
  placeholderKey:
    | "todayTasksPlaceholder"
    | "todayNotePlaceholder"
    | "tomorrowPlanPlaceholder";
  Icon: typeof PenLine;
  rows: number;
}[] = [
  {
    key: "today_tasks",
    labelKey: "todayTasks",
    placeholderKey: "todayTasksPlaceholder",
    Icon: NotebookText,
    rows: 3,
  },
  {
    key: "today_note",
    labelKey: "todayNote",
    placeholderKey: "todayNotePlaceholder",
    Icon: PenLine,
    rows: 2,
  },
  {
    key: "tomorrow_plan",
    labelKey: "tomorrowPlan",
    placeholderKey: "tomorrowPlanPlaceholder",
    Icon: Send,
    rows: 2,
  },
];

const IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]);

const VIDEO_TYPES =
  new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]);

const MAX_IMAGE_BYTES =
  15 * 1024 * 1024;

const MAX_VIDEO_BYTES =
  100 * 1024 * 1024;

function fileExtension(
  file: File
) {
  const fromName =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  if (
    fromName &&
    /^[a-z0-9]{2,5}$/.test(
      fromName
    )
  ) {
    return fromName;
  }

  const fallback:
    Record<
      string,
      string
    > = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };

  return (
    fallback[file.type] ??
    "bin"
  );
}

export default function EntryForm({
  groupId,
  userId,
  entryDate,
  initial,
  initialMedia = [],
}: {
  groupId: string;
  userId: string;
  entryDate: string;
  initial: Fields;
  initialMedia?: ExistingEntryMedia[];
}) {
  const router =
    useRouter();

  const { dictionary } =
    useI18n();

  const t =
    dictionary.today.journal;

  const common =
    dictionary.common;

  const [
    values,
    setValues,
  ] =
    useState<Fields>(
      initial
    );

  const [
    saved,
    setSaved,
  ] =
    useState<Fields>(
      initial
    );

  const [
    existingMedia,
    setExistingMedia,
  ] =
    useState<
      ExistingEntryMedia[]
    >(
      initialMedia
    );

  const [
    pendingMedia,
    setPendingMedia,
  ] =
    useState<
      PendingMedia[]
    >([]);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    removingId,
    setRemovingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    draggingSection,
    setDraggingSection,
  ] =
    useState<
      MediaSection | null
    >(null);

  const [
    msg,
    setMsg,
  ] =
    useState<{
      ok: boolean;
      text: string;
    } | null>(
      null
    );

  const inputRefs =
    useRef<
      Partial<
        Record<
          MediaSection,
          HTMLInputElement | null
        >
      >
    >({});

  useEffect(() => {
    setExistingMedia(
      initialMedia
    );
  }, [initialMedia]);

  const allMediaCount =
    existingMedia.length +
    pendingMedia.length;

  const mediaMode =
    useMemo(
      () => {
        const firstExisting =
          existingMedia[0]
            ?.media_type;

        const firstPending =
          pendingMedia[0]
            ?.mediaType;

        return (
          firstExisting ??
          firstPending ??
          null
        );
      },
      [
        existingMedia,
        pendingMedia,
      ]
    );

  const dirty =
    JSON.stringify(values) !==
      JSON.stringify(saved) ||
    pendingMedia.length > 0;

  function reject(
    text: string
  ) {
    setMsg({
      ok: false,
      text,
    });
  }

  function addFiles(
    section: MediaSection,
    files: File[]
  ) {
    if (files.length === 0) {
      return;
    }

    let nextMode =
      mediaMode;

    const accepted:
      PendingMedia[] = [];

    let nextCount =
      allMediaCount;

    for (
      const file of files
    ) {
      const isImage =
        IMAGE_TYPES.has(
          file.type
        );

      const isVideo =
        VIDEO_TYPES.has(
          file.type
        );

      if (
        !isImage &&
        !isVideo
      ) {
        reject(
          t.unsupportedMedia
        );

        continue;
      }

      const type =
        isImage
          ? "image"
          : "video";

      if (
        nextMode &&
        nextMode !== type
      ) {
        reject(
          t.mediaMixed
        );

        continue;
      }

      nextMode = type;

      if (
        type === "image" &&
        file.size >
          MAX_IMAGE_BYTES
      ) {
        reject(
          t.imageTooLarge
        );

        continue;
      }

      if (
        type === "video" &&
        file.size >
          MAX_VIDEO_BYTES
      ) {
        reject(
          t.videoTooLarge
        );

        continue;
      }

      if (
        type === "image" &&
        nextCount >= 6
      ) {
        reject(
          t.imageLimit
        );

        continue;
      }

      if (
        type === "video" &&
        nextCount >= 1
      ) {
        reject(
          t.videoLimit
        );

        continue;
      }

      accepted.push({
        id:
          crypto.randomUUID(),
        file,
        mediaType:
          type,
        section,
        previewUrl:
          URL.createObjectURL(
            file
          ),
      });

      nextCount += 1;
    }

    if (
      accepted.length > 0
    ) {
      setPendingMedia(
        (current) => [
          ...current,
          ...accepted,
        ]
      );

      setMsg(null);
    }
  }

  function removePending(
    id: string
  ) {
    setPendingMedia(
      (current) => {
        const target =
          current.find(
            (item) =>
              item.id === id
          );

        if (target) {
          URL.revokeObjectURL(
            target.previewUrl
          );
        }

        return current.filter(
          (item) =>
            item.id !== id
        );
      }
    );

    setMsg(null);
  }

  async function removeExisting(
    media:
      ExistingEntryMedia
  ) {
    if (
      busy ||
      removingId
    ) {
      return;
    }

    setRemovingId(
      media.id
    );

    setMsg(null);

    const supabase =
      createClient();

    const {
      error:
        storageError,
    } =
      await supabase
        .storage
        .from(
          "daily-media"
        )
        .remove([
          media.storage_path,
        ]);

    if (
      storageError
    ) {
      setRemovingId(
        null
      );

      reject(
        t.uploadFailed +
          storageError.message
      );

      return;
    }

    const {
      error:
        deleteError,
    } =
      await supabase
        .from(
          "daily_entry_media"
        )
        .delete()
        .eq(
          "id",
          media.id
        );

    setRemovingId(
      null
    );

    if (
      deleteError
    ) {
      reject(
        t.uploadFailed +
          deleteError.message
      );

      return;
    }

    setExistingMedia(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            media.id
        )
    );

    router.refresh();
  }

  async function uploadPending(
    entryId: string
  ) {
    if (
      pendingMedia.length ===
      0
    ) {
      return;
    }

    const supabase =
      createClient();

    const sectionOrders:
      Record<
        MediaSection,
        number
      > = {
        today_tasks:
          1000,
        today_note:
          1000,
        tomorrow_plan:
          1000,
      };

    for (
      const section of
        Object.keys(
          sectionOrders
        ) as
          MediaSection[]
    ) {
      const sameSection =
        existingMedia.filter(
          (item) =>
            item.section ===
            section
        );

      if (
        sameSection.length >
        0
      ) {
        sectionOrders[
          section
        ] =
          Math.max(
            ...sameSection.map(
              (item) =>
                item.sort_order
            )
          ) +
          1000;
      }
    }

    for (
      const item of
        pendingMedia
    ) {
      const path =
        userId +
        "/" +
        entryId +
        "/" +
        crypto.randomUUID() +
        "." +
        fileExtension(
          item.file
        );

      const {
        error:
          uploadError,
      } =
        await supabase
          .storage
          .from(
            "daily-media"
          )
          .upload(
            path,
            item.file,
            {
              contentType:
                item.file.type,
              upsert: false,
            }
          );

      if (
        uploadError
      ) {
        throw new Error(
          uploadError.message
        );
      }

      const {
        error:
          mediaError,
      } =
        await supabase
          .from(
            "daily_entry_media"
          )
          .insert({
            entry_id:
              entryId,
            user_id:
              userId,
            media_type:
              item.mediaType,
            section:
              item.section,
            storage_path:
              path,
            mime_type:
              item.file.type,
            size_bytes:
              item.file.size,
            sort_order:
              sectionOrders[
                item.section
              ],
          });

      if (
        mediaError
      ) {
        await supabase
          .storage
          .from(
            "daily-media"
          )
          .remove([
            path,
          ]);

        throw new Error(
          mediaError.message
        );
      }

      sectionOrders[
        item.section
      ] += 1000;
    }
  }

  async function save(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setBusy(true);
    setMsg(null);

    const clean =
      (s: string) =>
        s.trim()
          ? s.trim()
          : null;

    const supabase =
      createClient();

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "daily_entries"
        )
        .upsert(
          {
            user_id:
              userId,
            group_id:
              groupId,
            entry_date:
              entryDate,
            today_tasks:
              clean(
                values.today_tasks
              ),
            today_note:
              clean(
                values.today_note
              ),
            tomorrow_plan:
              clean(
                values.tomorrow_plan
              ),
          },
          {
            onConflict:
              "user_id,group_id,entry_date",
          }
        )
        .select("id")
        .single();

    if (
      error ||
      !data
    ) {
      setBusy(false);

      console.error(
        "Save daily entry failed:",
        error
      );

      setMsg({
        ok: false,
        text:
          t.saveFailed +
          (
            error?.message ??
            "No entry returned"
          ),
      });

      return;
    }

    try {
      await uploadPending(
        data.id
      );
    } catch (
      unknownError
    ) {
      setBusy(false);

      reject(
        t.uploadFailed +
          (
            unknownError instanceof
              Error
              ? unknownError.message
              : String(
                  unknownError
                )
          )
      );

      router.refresh();

      return;
    }

    for (
      const item of
        pendingMedia
    ) {
      URL.revokeObjectURL(
        item.previewUrl
      );
    }

    setPendingMedia([]);
    setSaved(values);
    setBusy(false);

    setMsg({
      ok: true,
      text: t.saved,
    });

    router.refresh();
  }

  return (
    <form
      onSubmit={save}
      className="mt-6 space-y-4"
    >
      {QUESTIONS.map(
        ({
          key,
          labelKey,
          placeholderKey,
          Icon,
          rows,
        }) => {
          const sectionExisting =
            existingMedia.filter(
              (item) =>
                item.section ===
                key
            );

          const sectionPending =
            pendingMedia.filter(
              (item) =>
                item.section ===
                key
            );

          return (
            <div
              key={key}
              className="card p-5"
            >
              <label
                htmlFor={key}
                className="label"
              >
                <Icon
                  className="h-4 w-4 text-ink-soft"
                  strokeWidth={
                    1.8
                  }
                />

                {t[labelKey]}
              </label>

              <textarea
                id={key}
                rows={rows}
                maxLength={
                  4000
                }
                className="input resize-none border-transparent bg-cream/60"
                placeholder={
                  t[
                    placeholderKey
                  ]
                }
                value={
                  values[key]
                }
                onChange={(
                  event
                ) => {
                  setValues({
                    ...values,
                    [key]:
                      event
                        .target
                        .value,
                  });

                  setMsg(
                    null
                  );
                }}
              />

              <input
                ref={(
                  node
                ) => {
                  inputRefs.current[
                    key
                  ] = node;
                }}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(
                  event
                ) => {
                  addFiles(
                    key,
                    Array.from(
                      event
                        .target
                        .files ??
                        []
                    )
                  );

                  event.target.value =
                    "";
                }}
              />

              <button
                type="button"
                onClick={() =>
                  inputRefs
                    .current[
                      key
                    ]
                    ?.click()
                }
                onDragEnter={(
                  event
                ) => {
                  event.preventDefault();
                  setDraggingSection(
                    key
                  );
                }}
                onDragOver={(
                  event
                ) => {
                  event.preventDefault();
                  setDraggingSection(
                    key
                  );
                }}
                onDragLeave={(
                  event
                ) => {
                  event.preventDefault();
                  setDraggingSection(
                    null
                  );
                }}
                onDrop={(
                  event
                ) => {
                  event.preventDefault();
                  setDraggingSection(
                    null
                  );

                  addFiles(
                    key,
                    Array.from(
                      event
                        .dataTransfer
                        .files
                    )
                  );
                }}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs transition ${
                  draggingSection ===
                  key
                    ? "border-sage-400 bg-sage-50 text-sage-700"
                    : "border-line bg-cream/30 text-ink-faint hover:border-sage-200 hover:bg-sage-50/50"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                {t.mediaDrop}
              </button>

              {(
                sectionExisting.length >
                  0 ||
                sectionPending.length >
                  0
              ) && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sectionExisting.map(
                    (item) => (
                      <div
                        key={
                          item.id
                        }
                        className="relative aspect-square overflow-hidden rounded-xl border border-line bg-black/[0.03]"
                      >
                        {item.media_type ===
                        "video" ? (
                          <video
                            src={
                              item.signed_url
                            }
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={
                              item.signed_url
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}

                        <button
                          type="button"
                          disabled={
                            removingId ===
                            item.id
                          }
                          onClick={() => {
                            void removeExisting(
                              item
                            );
                          }}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75 disabled:opacity-40"
                          aria-label={
                            t.removeMedia
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {item.media_type ===
                          "video" && (
                          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                            <Video className="h-3 w-3" />
                            Video
                          </span>
                        )}
                      </div>
                    )
                  )}

                  {sectionPending.map(
                    (item) => (
                      <div
                        key={
                          item.id
                        }
                        className="relative aspect-square overflow-hidden rounded-xl border border-sage-200 bg-sage-50"
                      >
                        {item.mediaType ===
                        "video" ? (
                          <video
                            src={
                              item.previewUrl
                            }
                            preload="metadata"
                            muted
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={
                              item.previewUrl
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            removePending(
                              item.id
                            )
                          }
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75"
                          aria-label={
                            t.removeMedia
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <span className="absolute bottom-2 left-2 rounded-full bg-sage-700/85 px-2 py-1 text-[9px] text-white">
                          {item.mediaType ===
                          "video"
                            ? "Video"
                            : "Photo"}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        }
      )}

      <div className="rounded-2xl border border-line bg-paper/55 px-4 py-3">
        <div className="flex items-start gap-3">
          <ImagePlus className="mt-0.5 h-4 w-4 text-sage-700" />

          <p className="text-xs leading-5 text-ink-faint">
            {t.mediaHint}
          </p>
        </div>
      </div>

      <button
        className="btn-primary w-full py-3.5"
        disabled={
          busy ||
          (
            !dirty &&
            msg?.ok !== false
          )
        }
      >
        {busy
          ? pendingMedia.length >
            0
            ? t.uploading
            : common.saving
          : t.save}
      </button>

      <div className="h-5 text-center text-sm">
        {msg ? (
          <span
            className={
              msg.ok
                ? "inline-flex items-center gap-1 text-sage-700"
                : "text-blush-500"
            }
          >
            {msg.ok && (
              <Check className="h-4 w-4" />
            )}

            {msg.text}
          </span>
        ) : dirty ? (
          <span className="text-ink-faint">
            {t.unsaved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
