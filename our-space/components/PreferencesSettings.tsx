"use client";

import {
  Bell,
  Check,
  Languages,
  Play,
  TimerReset,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  announcePreferencesUpdate,
  migrateLegacyFocusPreferences,
  saveUserPreferences,
  SOUND_IDS,
  type SoundId,
  type UserPreferences,
} from "@/lib/preferences";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";


const SOUND_LABELS: Record<
  SoundId,
  string
> = {
  "chime-1": "Chime 1",
  "chime-2": "Chime 2",
  "chime-3": "Chime 3",
  "chime-4": "Chime 4",
  "chime-5": "Chime 5",
  "chime-6": "Chime 6",
};


type Props = {
  userId: string;
  initialPreferences: UserPreferences;
};


export default function PreferencesSettings({
  userId,
  initialPreferences,
}: Props) {
  const { dictionary } = useI18n();
  const t = dictionary.settings;
  const common = dictionary.common;
  const [
    preferences,
    setPreferences,
  ] = useState(
    initialPreferences
  );

  const [
    savingKey,
    setSavingKey,
  ] = useState<
    string | null
  >(null);

  const [
    savedKey,
    setSavedKey,
  ] = useState<
    string | null
  >(null);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    previewingSound,
    setPreviewingSound,
  ] = useState<
    SoundId | null
  >(null);

  const saveTimerRef =
    useRef<number | null>(
      null
    );

  const audioRef =
    useRef<HTMLAudioElement | null>(
      null
    );


  /*
   * 第一次进入新 Settings 时，
   * 尝试把旧 Focus localStorage 设置迁移到数据库。
   *
   * 如果数据库已经有 Preferences，
   * migration 不会覆盖数据库值。
   */
  useEffect(() => {
    let cancelled = false;

    async function migrate() {
      try {
        const migrated =
          await migrateLegacyFocusPreferences(
            createClient(),
            userId
          );

        if (!cancelled) {
          setPreferences(
            migrated
          );
        }
      } catch {
        /*
         * Settings 本身仍然可以继续使用服务端初始值，
         * legacy migration 失败不阻断页面。
         */
      }
    }

    void migrate();

    return () => {
      cancelled = true;
    };
  }, [userId]);


  useEffect(() => {
    return () => {
      if (
        saveTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          saveTimerRef.current
        );
      }

      audioRef.current?.pause();
    };
  }, []);


  async function savePatch(
    key: string,
    patch: Parameters<
      typeof saveUserPreferences
    >[2]
  ) {
    setSavingKey(key);
    setSavedKey(null);
    setError(null);

    try {
      const saved =
        await saveUserPreferences(
          createClient(),
          userId,
          patch
        );

      setPreferences(
        saved
      );

      announcePreferencesUpdate(
        saved
      );

      setSavedKey(key);

      window.setTimeout(
        () => {
          setSavedKey(
            (current) =>
              current === key
                ? null
                : current
          );
        },
        1600
      );
    } catch (unknownError) {
      setError(
        unknownError instanceof
          Error
          ? unknownError.message
          : t.saveFailed
      );
    } finally {
      setSavingKey(null);
    }
  }


  function queueVolumeSave(
    value: number
  ) {
    const next = Math.max(
      0,
      Math.min(1, value)
    );

    setPreferences(
      (current) => ({
        ...current,
        sound_volume:
          next,
      })
    );

    if (
      saveTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        saveTimerRef.current
      );
    }

    saveTimerRef.current =
      window.setTimeout(
        () => {
          void savePatch(
            "volume",
            {
              sound_volume:
                next,
            }
          );
        },
        350
      );
  }


  function previewSound(
    soundId: SoundId
  ) {
    audioRef.current?.pause();

    const audio =
      new Audio(
        `/sounds/${soundId}.mp3`
      );

    audio.volume =
      preferences.sound_volume;

    audioRef.current =
      audio;

    setPreviewingSound(
      soundId
    );

    void audio
      .play()
      .catch(() => {
        setError(
          t.playBlocked
        );
      });

    audio.onended =
      () => {
        setPreviewingSound(
          (current) =>
            current === soundId
              ? null
              : current
        );
      };
  }


  return (
    <div className="space-y-6">
      {/* ================================================
          General
      ================================================ */}
      <section className="card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-50 text-sage-700">
            <Languages className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-medium">
              {t.general}
            </h2>

            <p className="mt-1 text-xs leading-5 text-ink-faint">
              {t.generalDescription}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="label">
            {t.language}
          </label>

          <select
            className="input"
            value={
              preferences.language
            }
            disabled={
              savingKey ===
              "language"
            }
            aria-label={
              t.languageAria
            }
            onChange={(event) => {
              const language =
                event.target.value as
                  UserPreferences["language"];

              setPreferences(
                (current) => ({
                  ...current,
                  language,
                })
              );

              void savePatch(
                "language",
                {
                  language,
                }
              );
            }}
          >
            <option value="zh-CN">
              {t.simplifiedChinese}
            </option>

            <option value="en">
              {t.english}
            </option>
          </select>
        </div>
      </section>


      {/* ================================================
          Sounds
      ================================================ */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">
              {t.soundTitle}
            </h2>

            <p className="mt-1 text-xs leading-5 text-ink-faint">
              {t.soundDescription}
            </p>
          </div>

          <button
            type="button"
            disabled={
              savingKey ===
              "sound_enabled"
            }
            onClick={() => {
              const next =
                !preferences.sound_enabled;

              setPreferences(
                (current) => ({
                  ...current,
                  sound_enabled:
                    next,
                })
              );

              void savePatch(
                "sound_enabled",
                {
                  sound_enabled:
                    next,
                }
              );
            }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
              preferences.sound_enabled
                ? "border-sage-300 bg-sage-50 text-sage-700"
                : "border-line bg-white text-ink-faint"
            }`}
            aria-label={
              preferences.sound_enabled
                ? t.disableSound
                : t.enableSound
            }
            title={
              preferences.sound_enabled
                ? t.disableSound
                : t.enableSound
            }
          >
            {preferences.sound_enabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-line/70 bg-white/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">
                {t.automaticSound}
              </p>

              <p className="mt-1 text-[11px] leading-4 text-ink-faint">
                {preferences.sound_enabled
                  ? t.soundOnDescription
                  : t.soundOffDescription}
              </p>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                preferences.sound_enabled
                  ? "bg-sage-100 text-sage-700"
                  : "bg-black/[0.04] text-ink-faint"
              }`}
            >
              {preferences.sound_enabled
                ? t.enabled
                : t.disabled}
            </span>
          </div>
        </div>


        <div className="mt-5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="sound-volume"
              className="label mb-0"
            >
              {t.volume}
            </label>

            <span className="text-xs tabular-nums text-ink-faint">
              {Math.round(
                preferences.sound_volume *
                  100
              )}
              %
            </span>
          </div>

          <input
            id="sound-volume"
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(
              preferences.sound_volume *
                100
            )}
            onChange={(event) =>
              queueVolumeSave(
                Number(
                  event.target.value
                ) / 100
              )
            }
            className="mt-3 w-full accent-sage-500"
          />

          <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
            <span>{common.mute}</span>
            <span>100%</span>
          </div>
        </div>


        <SoundPreferenceSection
          title={t.focusSound}
          description={t.focusSoundDescription}
          icon={
            <TimerReset className="h-4 w-4" />
          }
          value={
            preferences.focus_complete_sound
          }
          saving={
            savingKey ===
            "focus_complete_sound"
          }
          saved={
            savedKey ===
            "focus_complete_sound"
          }
          previewingSound={
            previewingSound
          }
          onPreview={
            previewSound
          }
          previewLabel={common.preview}
          previewLabel={common.preview}
          onChange={(soundId) => {
            setPreferences(
              (current) => ({
                ...current,
                focus_complete_sound:
                  soundId,
              })
            );

            void savePatch(
              "focus_complete_sound",
              {
                focus_complete_sound:
                  soundId,
              }
            );
          }}
        />


        <SoundPreferenceSection
          title={t.reminderSound}
          description={t.reminderSoundDescription}
          icon={
            <Bell className="h-4 w-4" />
          }
          value={
            preferences.reminder_sound
          }
          saving={
            savingKey ===
            "reminder_sound"
          }
          saved={
            savedKey ===
            "reminder_sound"
          }
          previewingSound={
            previewingSound
          }
          onPreview={
            previewSound
          }
          onChange={(soundId) => {
            setPreferences(
              (current) => ({
                ...current,
                reminder_sound:
                  soundId,
              })
            );

            void savePatch(
              "reminder_sound",
              {
                reminder_sound:
                  soundId,
              }
            );
          }}
        />


        {(savingKey ||
          savedKey) && (
          <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-faint">
            {savingKey ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-sage-300 border-t-sage-700" />
                {common.saving}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-sage-700" />
                {common.saved}
              </>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-blush-50 px-3 py-2 text-xs text-blush-500">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}


function SoundPreferenceSection({
  title,
  description,
  icon,
  value,
  saving,
  saved,
  previewingSound,
  onPreview,
  onChange,
  previewLabel,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  value: SoundId;
  saving: boolean;
  saved: boolean;
  previewingSound: SoundId | null;
  onPreview: (
    soundId: SoundId
  ) => void;
  onChange: (
    soundId: SoundId
  ) => void;
  previewLabel: string;
}) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex items-center gap-2">
        <span className="text-sage-700">
          {icon}
        </span>

        <div>
          <h3 className="text-sm font-medium text-ink">
            {title}
          </h3>

          <p className="mt-0.5 text-[11px] text-ink-faint">
            {description}
          </p>
        </div>

        {saving && (
          <span className="ml-auto text-[10px] text-ink-faint">
            保存中…
          </span>
        )}

        {!saving &&
          saved && (
            <Check className="ml-auto h-3.5 w-3.5 text-sage-700" />
          )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SOUND_IDS.map(
          (soundId) => {
            const selected =
              value ===
              soundId;

            const previewing =
              previewingSound ===
              soundId;

            return (
              <div
                key={soundId}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
                  selected
                    ? "border-sage-300 bg-sage-50"
                    : "border-line bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      soundId
                    )
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full border ${
                      selected
                        ? "border-sage-500 bg-sage-500"
                        : "border-ink-faint/70"
                    }`}
                  />

                  <span className="truncate text-xs text-ink-soft">
                    {
                      SOUND_LABELS[
                        soundId
                      ]
                    }
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onPreview(
                      soundId
                    )
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-sage-100"
                  aria-label={`${previewLabel} ${SOUND_LABELS[soundId]}`}
                  title={previewLabel}
                >
                  <Play
                    className={`ml-0.5 h-3.5 w-3.5 fill-current ${
                      previewing
                        ? "animate-pulse text-sage-700"
                        : ""
                    }`}
                  />
                </button>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
