import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ isTauri: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => native);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
it('lists real native families, deduplicates and caches successful discovery', async () => {
  native.isTauri.mockReturnValue(true);
  native.invoke.mockResolvedValue(['Zulu', 'Arial', 'Arial', '', 'A\nB']);
  const { systemFonts } = await import('./system-fonts');
  expect(await systemFonts()).toEqual(['Arial', 'Zulu']);
  await systemFonts();
  expect(native.invoke).toHaveBeenCalledTimes(1);
  expect(native.invoke).toHaveBeenCalledWith('system_fonts');
});
it('requests browser font access explicitly, deduplicating styles into families', async () => {
  native.isTauri.mockReturnValue(false);
  const query = vi
    .fn()
    .mockResolvedValue([
      { family: 'Arial', style: 'Regular' },
      { family: 'Arial', style: 'Bold' },
      { family: 'Times New Roman' },
    ]);
  vi.stubGlobal('queryLocalFonts', query);
  const { systemFonts } = await import('./system-fonts');
  expect(query).not.toHaveBeenCalled();
  expect(await systemFonts()).toEqual(['Arial', 'Times New Roman']);
  expect(query).toHaveBeenCalledOnce();
});
it('allows retry after denied browser permission', async () => {
  native.isTauri.mockReturnValue(false);
  const query = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValue([{ family: 'Arial' }]);
  vi.stubGlobal('queryLocalFonts', query);
  const { systemFonts } = await import('./system-fonts');
  await expect(systemFonts()).rejects.toThrow();
  expect(await systemFonts()).toEqual(['Arial']);
});
