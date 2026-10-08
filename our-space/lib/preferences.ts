import type {
  SupabaseClient,
} from "@supabase/supabase-js";


/* =========================================================
   Types
========================================================= */

export const SUPPORTED_LANGUAGES = [
  "zh-CN",
  "en",
] as const;

export type AppLanguage =
  (typeof SUPPORTED_LANGUAGES)[number];


export const SOUND_IDS = [
  "chime-1",
  "chime-2",
  "chime-3",
  "chime-4",
  "chime-5",
  "chime-6",
] as const;

export type SoundId =
  (typeof SOUND_IDS)[number];


export type UserPreferences = {
  user_id: string;
  language: AppLanguage;
  sound_enabled: boolean;
  sound_volume: number;
  focus_complete_sound: SoundId;
  reminder_sound: SoundId;
  created_at?: string;
  updated_at?: string;
};


export type EditablePreferences = Pick<
  UserPreferences,
  | "language"
  | "sound_enabled"
  | "sound_volume"
  | "focus_complete_sound"
  | "reminder_sound"
>;


/* =========================================================
   Defaults
========================================================= */

export const DEFAULT_PREFERENCES: EditablePreferences = {
  language: "zh-CN",
  sound_enabled: true,
  sound_volume: 0.5,
  focus_complete_sound: "chime-1",
  reminder_sound: "chime-2",
};


/* =========================================================
   Client sync
========================================================= */

export const PREFERENCES_UPDATED_EVENT =
  "ourspace:preferences-updated";

export const PREFERENCES_BROADCAST_CHANNEL =
  "ourspace-preferences";

/**
 * 同步当前浏览器标签页，并通知其它已打开的 Our Space 标签页。
 *
 * 这是一个浏览器辅助函数：
 * - Settings 保存成功后调用
 * - Focus / Reminder 监听
 * - 数据库仍然是最终真值
 */
export function announcePreferencesUpdate(
  preferences: UserPreferences
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<UserPreferences>(
      PREFERENCES_UPDATED_EVENT,
      {
        detail: preferences,
      }
    )
  );

  if (
    typeof BroadcastChannel !==
    "undefined"
  ) {
    const channel =
      new BroadcastChannel(
        PREFERENCES_BROADCAST_CHANNEL
      );

    channel.postMessage(
      preferences
    );

    channel.close();
  }
}


/* =========================================================
   Validation helpers
========================================================= */

export function isAppLanguage(
  value: unknown
): value is AppLanguage {
  return (
    typeof value === "string" &&
    SUPPORTED_LANGUAGES.includes(
      value as AppLanguage
    )
  );
}


export function isSoundId(
  value: unknown
): value is SoundId {
  return (
    typeof value === "string" &&
    SOUND_IDS.includes(
      value as SoundId
    )
  );
}


export function clampSoundVolume(
  value: number
) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.sound_volume;
  }

  return Math.max(
    0,
    Math.min(1, value)
  );
}


function normalizePreferences(
  userId: string,
  value:
    | Partial<UserPreferences>
    | null
    | undefined
): UserPreferences {
  return {
    user_id: userId,

    language:
      isAppLanguage(
        value?.language
      )
        ? value.language
        : DEFAULT_PREFERENCES.language,

    sound_enabled:
      typeof value?.sound_enabled ===
      "boolean"
        ? value.sound_enabled
        : DEFAULT_PREFERENCES.sound_enabled,

    sound_volume:
      typeof value?.sound_volume ===
      "number"
        ? clampSoundVolume(
            value.sound_volume
          )
        : DEFAULT_PREFERENCES.sound_volume,

    focus_complete_sound:
      isSoundId(
        value?.focus_complete_sound
      )
        ? value.focus_complete_sound
        : DEFAULT_PREFERENCES.focus_complete_sound,

    reminder_sound:
      isSoundId(
        value?.reminder_sound
      )
        ? value.reminder_sound
        : DEFAULT_PREFERENCES.reminder_sound,

    created_at:
      value?.created_at,

    updated_at:
      value?.updated_at,
  };
}


/* =========================================================
   Read
========================================================= */

/**
 * 读取用户 Preferences。
 *
 * 数据库没有记录时：
 * - 不自动写数据库
 * - 直接返回默认值
 *
 * 这样新用户在第一次真正修改设置前，
 * 不需要额外创建一条默认记录。
 */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPreferences> {
  const {
    data,
    error,
  } = await supabase
    .from("user_preferences")
    .select(
      [
        "user_id",
        "language",
        "sound_enabled",
        "sound_volume",
        "focus_complete_sound",
        "reminder_sound",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Failed to load user preferences: " +
        error.message
    );
  }

  return normalizePreferences(
    userId,
    data as Partial<UserPreferences> | null
  );
}


/**
 * 判断数据库中是否已经存在 Preferences 行。
 *
 * 主要用于旧 localStorage migration：
 * 只有数据库完全没有记录时，
 * 才允许导入旧 Focus 设置。
 */
export async function hasStoredPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const {
    data,
    error,
  } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Failed to check user preferences: " +
        error.message
    );
  }

  return Boolean(data);
}


/* =========================================================
   Write / upsert
========================================================= */

function sanitizePatch(
  patch: Partial<EditablePreferences>
): Partial<EditablePreferences> {
  const result:
    Partial<EditablePreferences> =
      {};

  if (
    patch.language !==
    undefined
  ) {
    if (
      !isAppLanguage(
        patch.language
      )
    ) {
      throw new Error(
        "Unsupported language."
      );
    }

    result.language =
      patch.language;
  }

  if (
    patch.sound_enabled !==
    undefined
  ) {
    result.sound_enabled =
      Boolean(
        patch.sound_enabled
      );
  }

  if (
    patch.sound_volume !==
    undefined
  ) {
    result.sound_volume =
      clampSoundVolume(
        patch.sound_volume
      );
  }

  if (
    patch.focus_complete_sound !==
    undefined
  ) {
    if (
      !isSoundId(
        patch.focus_complete_sound
      )
    ) {
      throw new Error(
        "Unsupported focus sound."
      );
    }

    result.focus_complete_sound =
      patch.focus_complete_sound;
  }

  if (
    patch.reminder_sound !==
    undefined
  ) {
    if (
      !isSoundId(
        patch.reminder_sound
      )
    ) {
      throw new Error(
        "Unsupported reminder sound."
      );
    }

    result.reminder_sound =
      patch.reminder_sound;
  }

  return result;
}


/**
 * 保存部分 Preferences。
 *
 * 使用 upsert：
 * - 已存在 -> update
 * - 不存在 -> insert
 *
 * 为了确保第一次 partial save 时不会丢失默认字段，
 * payload 会先合并 DEFAULT_PREFERENCES。
 */
export async function saveUserPreferences(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<EditablePreferences>
): Promise<UserPreferences> {
  const cleanPatch =
    sanitizePatch(patch);

  /*
   * 先读取现有值。
   *
   * 这能避免例如只修改 reminder_sound 时，
   * 把用户之前已经保存的 language / volume
   * 覆盖回默认值。
   */
  const current =
    await getUserPreferences(
      supabase,
      userId
    );

  const payload = {
    user_id: userId,
    language:
      cleanPatch.language ??
      current.language,
    sound_enabled:
      cleanPatch.sound_enabled ??
      current.sound_enabled,
    sound_volume:
      cleanPatch.sound_volume ??
      current.sound_volume,
    focus_complete_sound:
      cleanPatch.focus_complete_sound ??
      current.focus_complete_sound,
    reminder_sound:
      cleanPatch.reminder_sound ??
      current.reminder_sound,
  };

  const {
    data,
    error,
  } = await supabase
    .from("user_preferences")
    .upsert(
      payload,
      {
        onConflict:
          "user_id",
      }
    )
    .select(
      [
        "user_id",
        "language",
        "sound_enabled",
        "sound_volume",
        "focus_complete_sound",
        "reminder_sound",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .single();

  if (error) {
    throw new Error(
      "Failed to save user preferences: " +
        error.message
    );
  }

  return normalizePreferences(
    userId,
    data as Partial<UserPreferences>
  );
}


/* =========================================================
   Legacy Focus localStorage migration
========================================================= */

const LEGACY_FOCUS_SOUND_KEY =
  "focus_sound";

const LEGACY_FOCUS_SOUND_ENABLED_KEY =
  "focus_sound_enabled";

const LEGACY_MIGRATION_KEY_PREFIX =
  "ourspace_preferences_migrated:";


/**
 * 将旧 Focus localStorage 设置迁移到数据库。
 *
 * 只应该在浏览器客户端调用。
 *
 * 规则：
 * 1. 数据库已经有 Preferences -> 不覆盖。
 * 2. 数据库没有 Preferences -> 读取合法旧值。
 * 3. 如果旧值存在，创建一条新 Preferences。
 * 4. migration flag 按 userId 隔离。
 *
 * Reminder 默认仍为 chime-2。
 */
export async function migrateLegacyFocusPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPreferences> {
  if (
    typeof window ===
    "undefined"
  ) {
    return getUserPreferences(
      supabase,
      userId
    );
  }

  const migrationKey =
    LEGACY_MIGRATION_KEY_PREFIX +
    userId;

  try {
    if (
      window.localStorage.getItem(
        migrationKey
      ) === "1"
    ) {
      return getUserPreferences(
        supabase,
        userId
      );
    }
  } catch {
    /*
     * localStorage 不可用时，
     * 仍可以继续使用数据库默认值。
     */
    return getUserPreferences(
      supabase,
      userId
    );
  }

  const alreadyStored =
    await hasStoredPreferences(
      supabase,
      userId
    );

  if (alreadyStored) {
    try {
      window.localStorage.setItem(
        migrationKey,
        "1"
      );
    } catch {
      // 不影响数据库 Preferences。
    }

    return getUserPreferences(
      supabase,
      userId
    );
  }

  let legacySound:
    SoundId | undefined;

  let legacyEnabled:
    boolean | undefined;

  try {
    const rawSound =
      window.localStorage.getItem(
        LEGACY_FOCUS_SOUND_KEY
      );

    if (
      isSoundId(rawSound)
    ) {
      legacySound =
        rawSound;
    }

    const rawEnabled =
      window.localStorage.getItem(
        LEGACY_FOCUS_SOUND_ENABLED_KEY
      );

    if (
      rawEnabled === "true"
    ) {
      legacyEnabled = true;
    } else if (
      rawEnabled === "false"
    ) {
      legacyEnabled = false;
    }
  } catch {
    return getUserPreferences(
      supabase,
      userId
    );
  }

  /*
   * 没有任何旧值时，不为了 migration
   * 强行创建一条数据库记录。
   */
  if (
    legacySound ===
      undefined &&
    legacyEnabled ===
      undefined
  ) {
    try {
      window.localStorage.setItem(
        migrationKey,
        "1"
      );
    } catch {
      // ignore
    }

    return getUserPreferences(
      supabase,
      userId
    );
  }

  const migrated =
    await saveUserPreferences(
      supabase,
      userId,
      {
        ...(legacySound
          ? {
              focus_complete_sound:
                legacySound,
            }
          : {}),

        ...(legacyEnabled !==
        undefined
          ? {
              sound_enabled:
                legacyEnabled,
            }
          : {}),
      }
    );

  try {
    window.localStorage.setItem(
      migrationKey,
      "1"
    );
  } catch {
    // 数据库已经保存成功，不影响结果。
  }

  return migrated;
}
