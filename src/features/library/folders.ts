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
type FolderBook = { folder?: string; folders?: string[] };
export function normalizeFolders(values: readonly string[]): string[] {
  const folders = [...new Set(values.map(normalizeFolder))];
  if (folders.some((folder) => !folder) || folders.length > 32)
    throw new Error('Choose up to 32 nonempty folders.');
  return folders;
}
export function validFolders(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (folder) => typeof folder === 'string' && !!folder && validFolder(folder),
    ) &&
    new Set(value).size === value.length
  );
}
export function bookFolders(book: FolderBook): string[] {
  if (book.folders !== undefined) return normalizeFolders(book.folders);
  return book.folder ? normalizeFolders([book.folder]) : [];
}
/** Keep the legacy primary path readable by older clients. */
export function migrateBookFolders<T extends FolderBook>(book: T): T {
  if (book.folders === undefined && book.folder === undefined) return book;
  const folders = bookFolders(book);
  return { ...book, folders, folder: folders[0] ?? '' };
}
export const bookInFolder = (book: FolderBook, parent: string) =>
  !parent || bookFolders(book).some((path) => folderContains(parent, path));
export const bookDirectlyInFolder = (book: FolderBook, parent: string) =>
  parent ? bookFolders(book).includes(parent) : bookFolders(book).length === 0;
export function folderPaths(
  books: FolderBook[],
  explicit: readonly string[] = [],
) {
  const paths = new Set<string>();
  for (const book of [...books, ...explicit.map((folder) => ({ folder }))]) {
    for (const folder of bookFolders(book)) {
      const parts = folder.split('/');
      for (let i = 1; i <= parts.length; i++)
        paths.add(parts.slice(0, i).join('/'));
    }
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
