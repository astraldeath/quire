import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Folder, Search } from 'lucide-react';

export function FolderPicker({
  paths,
  selected,
  mixed = [],
  mode = 'multiple',
  searchRef,
  onToggle,
  disabled = false,
}: {
  paths: string[];
  selected: string[];
  mixed?: string[];
  mode?: 'multiple' | 'single';
  searchRef?: RefObject<HTMLInputElement | null>;
  onToggle(path: string, checked: boolean): void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const internalSearch = useRef<HTMLInputElement>(null);
  const search = searchRef ?? internalSearch;
  const choices = [...new Set(paths)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const matches = choices.filter((path) =>
    (path || 'Library')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const visible =
    mode === 'single' && query.trim()
      ? [
          ...choices.filter((path) => selected.includes(path)),
          ...matches.filter((path) => !selected.includes(path)),
        ]
      : matches;
  useLayoutEffect(() => {
    if (choices.length > 8) search.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="folder-picker">
      <label className="folder-picker-search">
        <Search aria-hidden="true" />
        <span className="visually-hidden">Search folders</span>
        <input
          ref={search}
          type="search"
          aria-label="Search folders"
          placeholder="Search folders"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="folder-choices" role="group" aria-label="Folders">
        {visible.map((path) => {
          const checked = selected.includes(path);
          const indeterminate = mixed.includes(path);
          const name = path ? path.split('/').at(-1)! : 'Library';
          const depth = path ? path.split('/').length - 1 : 0;
          return (
            <label
              key={path || ':root'}
              className="folder-choice"
              style={{ '--folder-depth': depth } as CSSProperties}
            >
              <Folder aria-hidden="true" />
              <span title={path || 'Library'}>{name}</span>
              <input
                type={mode === 'single' ? 'radio' : 'checkbox'}
                name={mode === 'single' ? 'folder-picker-single' : undefined}
                aria-label={path || 'Library'}
                aria-checked={indeterminate ? 'mixed' : checked}
                ref={(input) => {
                  if (input) input.indeterminate = indeterminate;
                }}
                checked={checked}
                disabled={disabled}
                onChange={(event) => onToggle(path, event.target.checked)}
              />
            </label>
          );
        })}
        {!visible.length && (
          <p className="folder-picker-empty">
            {query.trim() ? 'No folders match your search.' : 'No folders yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
