type TauriCore = {
  invoke<T = unknown>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T>;
};

declare global {
  interface Window {
    __TAURI__?: {
      core?: TauriCore;
    };
  }
}

function tauriCore() {
  if (
    typeof window === "undefined" ||
    !window.__TAURI__?.core
  ) {
    return null;
  }

  return window.__TAURI__.core;
}

export function isTauriDesktop() {
  return Boolean(tauriCore());
}

export async function openDesktopFocusTimer(
  todoId: string
) {
  const core = tauriCore();

  if (!core) {
    return false;
  }

  await core.invoke(
    "open_focus_timer",
    {
      todoId,
    }
  );

  return true;
}

export async function openDesktopFocusWorkspace(
  todoId: string
) {
  const core = tauriCore();

  if (!core) {
    return false;
  }

  await core.invoke(
    "open_focus_workspace",
    {
      todoId,
    }
  );

  return true;
}

export async function setDesktopWindowPinned(
  label: string,
  pinned: boolean
) {
  const core = tauriCore();

  if (!core) {
    return false;
  }

  await core.invoke(
    "set_focus_window_pinned",
    {
      label,
      pinned,
    }
  );

  return true;
}
