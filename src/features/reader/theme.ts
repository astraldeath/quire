import type { ReaderPreferences } from '../../domain/models';
export function resolveReaderTheme(
  p: ReaderPreferences,
  appTheme = 'system',
  systemDark = false,
  appColors?: { background: string; foreground: string },
) {
  const mode =
    p.theme === 'app'
      ? appTheme === 'system'
        ? systemDark
          ? 'dark'
          : 'light'
        : appTheme
      : p.theme;
  const contrast = mode === 'contrast';
  if (mode === 'onyx')
    return {
      background: '#000000',
      foreground: '#d6d6d6',
      contrast: false,
      dark: true,
    };
  if (contrast)
    return {
      background: '#000000',
      foreground: '#ffffff',
      contrast,
      dark: true,
    };
  if (p.theme === 'app' && mode === 'custom' && appColors)
    return resolveReaderTheme({ ...p, theme: 'custom', ...appColors });
  if (mode === 'custom') {
    const background = /^#[0-9a-f]{6}$/i.test(p.background)
      ? p.background
      : '#ffffff';
    const foreground = /^#[0-9a-f]{6}$/i.test(p.foreground)
      ? p.foreground
      : '#202020';
    const rgb = background
      .slice(1)
      .match(/../g)!
      .map((n) => parseInt(n, 16));
    return {
      background,
      foreground,
      contrast,
      dark: rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128,
    };
  }
  return mode === 'dark'
    ? { background: '#171819', foreground: '#e7e5df', contrast, dark: true }
    : { background: '#faf9f6', foreground: '#252525', contrast, dark: false };
}
/** Theme text without recoloring SVG paths, illustrations, or raster images. */
export function readerThemeCss(foreground: string, background: string) {
  return `html, body { color: ${foreground} !important; background-color: ${background} !important; }
    body :not(svg):not(svg *):not(img):not(picture):not(video):not(canvas) { color: ${foreground} !important; background-color: transparent !important; }`;
}
