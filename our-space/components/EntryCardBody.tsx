type Body = {
  today_tasks: string | null;
  today_note: string | null;
  tomorrow_plan: string | null;
};

export type EntryMediaView = {
  id: string;
  media_type:
    | "image"
    | "video";
  section:
    | "today_tasks"
    | "today_note"
    | "tomorrow_plan";
  signed_url: string;
};

export function EntryMediaGrid({
  media,
  controls = true,
}: {
  media: EntryMediaView[];
  controls?: boolean;
}) {
  if (media.length === 0) {
    return null;
  }

  if (
    media.length === 1 &&
    media[0].media_type ===
      "video"
  ) {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-black/[0.03]">
        <video
          src={
            media[0].signed_url
          }
          controls={controls}
          preload="metadata"
          className="max-h-[520px] w-full bg-black object-contain"
        />
      </div>
    );
  }

  const gridClass =
    media.length === 1
      ? "grid-cols-1"
      : media.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div
      className={`mt-2 grid gap-1.5 overflow-hidden rounded-xl ${gridClass}`}
    >
      {media.map(
        (item) => (
          <div
            key={item.id}
            className={`overflow-hidden bg-black/[0.03] ${
              media.length ===
              1
                ? "aspect-[4/3]"
                : "aspect-square"
            }`}
          >
            {item.media_type ===
            "video" ? (
              <video
                src={
                  item.signed_url
                }
                controls={controls}
                preload="metadata"
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <img
                src={
                  item.signed_url
                }
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        )
      )}
    </div>
  );
}

export function EntryBody({
  entry,
  tint,
  media = [],
  mediaControls = true,
}: {
  entry: Body;
  tint: string;
  media?: EntryMediaView[];
  mediaControls?: boolean;
}) {
  const sections = [
    {
      key:
        "today_tasks" as const,
      label:
        "今天做了什么？",
      value:
        entry.today_tasks,
    },
    {
      key:
        "today_note" as const,
      label:
        "今天想说的一句话",
      value:
        entry.today_note,
    },
    {
      key:
        "tomorrow_plan" as const,
      label:
        "明天想做什么？",
      value:
        entry.tomorrow_plan,
    },
  ];

  const visible =
    sections.filter(
      (section) =>
        Boolean(
          section.value?.trim()
        ) ||
        media.some(
          (item) =>
            item.section ===
            section.key
        )
    );

  return (
    <div
      className={`space-y-3 rounded-2xl ${tint} px-5 py-4`}
    >
      {visible.length ===
        0 && (
        <p className="text-sm text-ink-faint">
          今天什么也没写，但来过了 🌿
        </p>
      )}

      {visible.map(
        (section) => {
          const sectionMedia =
            media.filter(
              (item) =>
                item.section ===
                section.key
            );

          return (
            <div
              key={
                section.key
              }
            >
              <p className="text-xs text-ink-faint">
                {section.label}
              </p>

              {section.value?.trim() && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                  {section.value}
                </p>
              )}

              <EntryMediaGrid
                media={
                  sectionMedia
                }
                controls={
                  mediaControls
                }
              />
            </div>
          );
        }
      )}
    </div>
  );
}
