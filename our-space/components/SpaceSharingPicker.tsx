"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * 任务的分享范围（问题 15）。
 * groupIds 为空 = 仅自己可见。两个开关对所有已选 Space 统一生效。
 * 数据库：todo_space_shares + todos.share_description / share_progress，
 * 写入统一走 set_task_sharing()。
 */
export type TaskSharing = {
  groupIds: string[];
  shareDescription: boolean;
  shareProgress: boolean;
};

export const PRIVATE_SHARING: TaskSharing = {
  groupIds: [],
  shareDescription: true,
  shareProgress: false,
};

export function sameSharing(a: TaskSharing, b: TaskSharing): boolean {
  if (a.shareDescription !== b.shareDescription || a.shareProgress !== b.shareProgress) return false;
  if (a.groupIds.length !== b.groupIds.length) return false;
  const set = new Set(a.groupIds);
  return b.groupIds.every((id) => set.has(id));
}

export async function loadTaskSharing(
  supabase: SupabaseClient,
  todoId: string
): Promise<TaskSharing | null> {
  const [shares, flags] = await Promise.all([
    supabase.from("todo_space_shares").select("group_id").eq("todo_id", todoId),
    supabase.from("todos").select("share_description, share_progress").eq("id", todoId).maybeSingle(),
  ]);
  if (shares.error || flags.error || !flags.data) return null;
  return {
    groupIds: (shares.data ?? []).map((row) => row.group_id as string),
    shareDescription: flags.data.share_description !== false,
    shareProgress: flags.data.share_progress === true,
  };
}

export async function saveTaskSharing(
  supabase: SupabaseClient,
  todoId: string,
  sharing: TaskSharing
): Promise<string | null> {
  const { error } = await supabase.rpc("set_task_sharing", {
    p_todo_id: todoId,
    p_group_ids: sharing.groupIds,
    p_share_description: sharing.shareDescription,
    p_share_progress: sharing.shareProgress,
  });
  return error ? error.message : null;
}

type Space = { id: string; name: string };

export default function SpaceSharingPicker({
  value,
  onChange,
  hasDescription,
  zh,
  disabled,
}: {
  value: TaskSharing;
  onChange: (next: TaskSharing) => void;
  hasDescription: boolean;
  zh: boolean;
  disabled?: boolean;
}) {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    createClient()
      .from("groups")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (alive) setSpaces((data ?? []) as Space[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const shared = value.groupIds.length > 0;
  const names = (spaces ?? [])
    .filter((space) => value.groupIds.includes(space.id))
    .map((space) => space.name);
  const label = !shared
    ? zh ? "仅自己" : "Only me"
    : names.length
      ? names.join(zh ? "、" : ", ")
      : zh ? `${value.groupIds.length} 个空间` : `${value.groupIds.length} spaces`;

  function toggle(id: string) {
    const groupIds = value.groupIds.includes(id)
      ? value.groupIds.filter((x) => x !== id)
      : [...value.groupIds, id];
    onChange({ ...value, groupIds });
  }

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{zh ? "可见范围" : "Visibility"}</span>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-left text-sm text-ink outline-none focus:border-sage-300 focus:ring-2 focus:ring-sage-100 disabled:opacity-60"
        >
          <span className="truncate">{label}</span>
          <span aria-hidden className="text-xs text-ink-faint">{open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <div
            role="listbox"
            aria-multiselectable
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white py-1 shadow-sm"
          >
            <button
              type="button"
              role="option"
              aria-selected={!shared}
              onClick={() => onChange({ ...value, groupIds: [] })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper"
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full border ${!shared ? "border-sage-400 bg-sage-400" : "border-line"}`} />
              {zh ? "仅自己" : "Only me"}
            </button>
            <div className="my-1 border-t border-line" />
            {spaces === null ? (
              <p className="px-3 py-2 text-xs text-ink-faint">{zh ? "加载中…" : "Loading…"}</p>
            ) : spaces.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-faint">{zh ? "还没有加入任何空间" : "No spaces yet"}</p>
            ) : (
              spaces.map((space) => {
                const checked = value.groupIds.includes(space.id);
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(space.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper"
                  >
                    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none text-white ${checked ? "border-sage-400 bg-sage-400" : "border-line"}`}>
                      {checked ? "✓" : ""}
                    </span>
                    <span className="truncate">{space.name}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {shared && (
        <div className="space-y-1.5 text-xs text-ink-soft">
          {hasDescription && (
            <p className="flex items-center justify-between gap-2">
              <span>
                {value.shareDescription
                  ? zh ? "描述对空间成员可见" : "Description visible to members"
                  : zh ? "描述已隐藏" : "Description hidden"}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, shareDescription: !value.shareDescription })}
                className="text-ink-faint underline-offset-2 hover:text-ink-soft hover:underline"
              >
                {value.shareDescription ? (zh ? "隐藏" : "Hide") : (zh ? "显示" : "Show")}
              </button>
            </p>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.shareProgress}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, shareProgress: e.target.checked })}
            />
            {zh ? "分享完成情况与专注时长" : "Share progress and focus time"}
          </label>
        </div>
      )}
    </div>
  );
}
