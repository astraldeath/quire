export function normalizeFolder(value: string): string {
  if (!value.trim()) return '';
  const parts = value.split('/').map((part) => part.trim());
  if (
    new TextEncoder().encode(value).length > 1024 ||
    parts.length > 32 ||
    parts.some(
      (part) =>
        !part ||
        new TextEncoder().encode(part).length > 255 ||
        part === '.' ||
        part === '..' ||
        /[\\:\u0000-\u001f\u007f-\u009f]/.test(part),
    )
  )
    throw new Error(
      'Use folder names separated by /, without empty names or ..',
    );
  return parts.join('/');
}
export function validFolder(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return normalizeFolder(value) === value;
  } catch {
    return false;
  }
}
export const folderContains = (parent: string, path: string) =>
  !parent || path === parent || path.startsWith(`${parent}/`);
export function folderPaths(books: { folder?: string }[]) {
  const paths = new Set<string>();
  for (const book of books) {
    if (!book.folder || !validFolder(book.folder)) continue;
    const parts = book.folder.split('/');
    for (let i = 1; i <= parts.length; i++)
      paths.add(parts.slice(0, i).join('/'));
  }
  return [...paths].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}
export const childFolders = (paths: string[], parent: string) =>
  paths.filter(
    (path) => path.slice(0, Math.max(0, path.lastIndexOf('/'))) === parent,
  );
export function importFolder(relativePath: string, parent: string) {
  const directory = relativePath.includes('/')
    ? relativePath.slice(0, relativePath.lastIndexOf('/'))
    : '';
  return normalizeFolder([parent, directory].filter(Boolean).join('/'));
}
