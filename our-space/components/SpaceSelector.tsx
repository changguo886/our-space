"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";

type Space = {
  id: string;
  name: string;
};

type SpaceSelectorProps = {
  spaces: Space[];
  activeSpaceId: string;
};

export default function SpaceSelector({
  spaces,
  activeSpaceId,
}: SpaceSelectorProps) {
  const router = useRouter();
  const { dictionary } = useI18n();

  function switchSpace(spaceId: string) {
    // 保存当前选择的 Space，一年后过期
    document.cookie =
      `active_space_id=${encodeURIComponent(spaceId)}; ` +
      `path=/; max-age=31536000; samesite=lax`;

    // 让 Server Components 重新读取 cookie
    router.refresh();
  }

  return (
    <div className="mb-7">
      <label
        htmlFor="space-selector"
        className="mb-2 block text-xs text-ink-faint"
      >
        {dictionary.settings.currentSpaceLabel}
      </label>

      <select
        id="space-selector"
        value={activeSpaceId}
        onChange={(e) => switchSpace(e.target.value)}
        className="input max-w-xs"
      >
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name}
          </option>
        ))}
      </select>
    </div>
  );
}
