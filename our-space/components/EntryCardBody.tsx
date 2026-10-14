import MediaGallery from "@/components/MediaGallery";
import LinkifiedText from "@/components/LinkifiedText";

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
}: {
  media: EntryMediaView[];
  /** Kept for callers; videos now play in the lightbox with controls. */
  controls?: boolean;
}) {
  return <MediaGallery media={media} />;
}

export function EntryBody({
  entry,
  tint,
  media = [],
}: {
  entry: Body;
  tint: string;
  media?: EntryMediaView[];
  /** No longer used: media always opens in the lightbox. */
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
      className={`space-y-2.5 rounded-2xl ${tint} px-4 py-3`}
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
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                  <LinkifiedText text={section.value} />
                </p>
              )}

              <EntryMediaGrid media={sectionMedia} />
            </div>
          );
        }
      )}
    </div>
  );
}
