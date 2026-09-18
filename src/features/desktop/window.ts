import { invoke, isTauri } from '@tauri-apps/api/core';

export interface DesktopWindowState {
  desktop: boolean;
  maximized: boolean;
  fullscreen: boolean;
  decorated: boolean;
}
export type WindowAction =
  'state' | 'custom' | 'native' | 'minimize' | 'maximize' | 'close' | 'drag';

// The native build target is authoritative; mobile WebViews also have isTauri().
export async function desktopWindow(
  action: WindowAction = 'state',
): Promise<DesktopWindowState | null> {
  if (import.meta.env.VITE_HOSTED === 'true' || !isTauri()) return null;
  const state = await invoke<DesktopWindowState>('desktop_window', { action });
  return state.desktop ? state : null;
}
