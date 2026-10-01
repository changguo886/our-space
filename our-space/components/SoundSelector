"use client";

import { useEffect, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

const SOUNDS = [
  { id: "chime-1", label: "Chime 1" },
  { id: "chime-2", label: "Chime 2" },
  { id: "chime-3", label: "Chime 3" },
  { id: "chime-4", label: "Chime 4" },
  { id: "chime-5", label: "Chime 5" },
  { id: "chime-6", label: "Chime 6" },
];

export default function SoundSelector() {
  const [selectedSound, setSelectedSound] = useState("chime-1");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedSound =
      localStorage.getItem("focus_sound") ?? "chime-1";

    const savedEnabled =
      localStorage.getItem("focus_sound_enabled");

    setSelectedSound(savedSound);

    setSoundEnabled(
      savedEnabled === null
        ? true
        : savedEnabled === "true"
    );

    setReady(true);
  }, []);

  function chooseSound(soundId: string) {
    setSelectedSound(soundId);
    localStorage.setItem("focus_sound", soundId);
  }

  function toggleSound() {
    const next = !soundEnabled;

    setSoundEnabled(next);

    localStorage.setItem(
      "focus_sound_enabled",
      String(next)
    );
  }

  function previewSound(soundId: string) {
    const audio = new Audio(
      `/sounds/${soundId}.mp3`
    );

    audio.volume = 0.5;

    audio.play().catch(() => {
      // 浏览器阻止播放时，不影响页面
    });
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-white/70 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            完成提示音
          </h3>

          <p className="mt-1 text-xs text-ink-faint">
            专注结束时播放一个轻柔的提示音。
          </p>
        </div>

        <button
          type="button"
          onClick={toggleSound}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white transition hover:bg-sage-50"
          title={
            soundEnabled
              ? "关闭提示音"
              : "打开提示音"
          }
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
      </div>

      {soundEnabled && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {SOUNDS.map((sound) => {
            const selected =
              selectedSound === sound.id;

            return (
              <div
                key={sound.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-3 transition ${
                  selected
                    ? "border-sage-300 bg-sage-50"
                    : "border-line bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    chooseSound(sound.id)
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={`h-3 w-3 rounded-full border ${
                      selected
                        ? "border-sage-500 bg-sage-500"
                        : "border-ink-faint"
                    }`}
                  />

                  <span className="truncate text-sm">
                    {sound.label}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    previewSound(sound.id)
                  }
                  className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-sage-100"
                  title="试听"
                >
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
