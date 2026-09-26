import { invoke, isTauri } from '@tauri-apps/api/core';
type FontWindow = typeof globalThis & {
  queryLocalFonts?: () => Promise<{ family: string }[]>;
};
let pending: Promise<string[]> | undefined;
export const canListSystemFonts = () =>
  isTauri() || typeof (globalThis as FontWindow).queryLocalFonts === 'function';
export const nativeFonts = () => isTauri();
export const systemFontName = (value: string) =>
  value.startsWith('system:') ? value.slice(7) : undefined;
export function systemFonts(): Promise<string[]> {
  if (pending) return pending;
  pending = (async () => {
    let names: unknown;
    if (isTauri()) names = await invoke('system_fonts');
    else {
      const query = (globalThis as FontWindow).queryLocalFonts;
      if (!query)
        throw new Error(
          'This browser cannot list system fonts. You can import a font instead.',
        );
      names = (await query.call(globalThis)).map((f) => f.family);
    }
    if (!Array.isArray(names)) throw new Error('Could not load system fonts.');
    return [
      ...new Set(
        names
          .filter(
            (name): name is string =>
              typeof name === 'string' &&
              name.trim().length > 0 &&
              name.length <= 180 &&
              !/[\x00-\x1f\x7f]/.test(name),
          )
          .map((name) => name.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b));
  })().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
