import { validFolder } from './folders';

export interface FolderCatalog {
  library: string[];
  hidden: string[];
}
export interface FolderCatalogState {
  value: FolderCatalog;
  sync?: { account: string; revision: number; baseline: FolderCatalog };
}
export const emptyFolderCatalog = (): FolderCatalog => ({
  library: [],
  hidden: [],
});
export function validateFolderCatalog(value: unknown): FolderCatalog {
  const invalid = () => {
    throw new Error('Invalid folder catalog.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  const v = value as FolderCatalog;
  const paths = (items: unknown): string[] => {
    if (
      !Array.isArray(items) ||
      items.length > 5000 ||
      items.some((p) => !p || !validFolder(p))
    )
      return invalid();
    return [...new Set(items as string[])].sort();
  };
  const out = { library: paths(v.library), hidden: paths(v.hidden) };
  if (new TextEncoder().encode(JSON.stringify(out)).length > 1024 * 1024)
    return invalid();
  return out;
}
/** Apply local presence changes to remote; unchanged local paths never resurrect deletions. */
export function mergeFolderCatalog(
  base: FolderCatalog,
  local: FolderCatalog,
  remote: FolderCatalog,
): FolderCatalog {
  const merge = (scope: keyof FolderCatalog) => {
    const result = new Set(remote[scope]);
    for (const path of base[scope])
      if (!local[scope].includes(path)) result.delete(path);
    for (const path of local[scope])
      if (!base[scope].includes(path)) result.add(path);
    return [...result];
  };
  return validateFolderCatalog({
    library: merge('library'),
    hidden: merge('hidden'),
  });
}
