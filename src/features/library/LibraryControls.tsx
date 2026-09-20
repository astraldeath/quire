import { useId, useState } from 'react';
import {
  ArrowDownWideNarrow,
  CheckSquare,
  ChevronRight,
  EyeOff,
  Grid2X2,
  ListFilter,
  X,
} from 'lucide-react';
import { OptionsPanel } from '../../components/OptionsPanel';
import type { ActionAnchor } from '../../components/ActionPopover';
import { Segments } from '../../components/Controls';
import type { Preferences } from '../../domain/models';
import { naturalSortDirection } from '../../domain/library';
import { ViewOptions } from './ViewOptions';

const sortOptions = [
  ['last-read', 'Last read'],
  ['added', 'Date added'],
  ['title', 'Title'],
  ['author', 'Author'],
] as const;

export function LibraryControls({
  preferences,
  onChange,
  status,
  availability,
  onFilter,
  series,
  selecting,
  onSelect,
  collections = [],
  collection = 'all',
  onHidden,
}: {
  onHidden?: () => void;
  collections?: { id: string; name: string }[];
  collection?: string;
  preferences: Preferences;
  onChange(p: Preferences): void;
  status: string;
  availability: string;
  onFilter(key: string, value: string): void;
  series: boolean;
  selecting: boolean;
  onSelect(): void;
}) {
  const [panel, setPanel] = useState('');
  const [anchor, setAnchor] = useState<ActionAnchor>();
  const sortName = useId();
  const directionName = useId();
  const sortDescription = useId();
  const sort =
    preferences.sort === 'recent'
      ? series
        ? 'volume'
        : 'last-read'
      : preferences.sort;
  const direction = preferences.sortDirection ?? naturalSortDirection(sort);
  const labels = new Map<Preferences['sort'], string>([
    ...sortOptions,
    ['volume', 'Volume'],
    ['recent', 'Recent'],
  ]);
  const open = (name: string, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    setAnchor({
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      element,
    });
    setPanel(name);
  };
  return (
    <>
      <div className="library-tools">
        <button
          onClick={(event) => open('Filters', event.currentTarget)}
          aria-label="Filter books"
        >
          <ListFilter />
          Filters
          {(status !== 'all' ||
            availability !== 'all' ||
            collection !== 'all') && <span className="filter-dot" />}
        </button>
        <button
          onClick={(event) => open('Sort', event.currentTarget)}
          aria-label="Sort books"
          aria-describedby={sortDescription}
        >
          <ArrowDownWideNarrow />
          Sort
        </button>
        <span id={sortDescription} className="sr-only">
          Sorted by {labels.get(sort)},{' '}
          {direction === 'asc' ? 'ascending' : 'descending'}
        </span>
        <button
          onClick={(event) => open('View', event.currentTarget)}
          aria-label="Library view options"
        >
          <Grid2X2 />
          View
        </button>
        <button
          aria-label="Select books"
          aria-pressed={selecting}
          onClick={onSelect}
        >
          {selecting ? <X /> : <CheckSquare />}
          {selecting ? 'Done' : 'Select'}
        </button>
      </div>
      {panel && (
        <OptionsPanel
          title={panel}
          anchor={anchor}
          onClose={() => setPanel('')}
        >
          <div className="library-options">
            {panel === 'Filters' && (
              <>
                {collections.length > 0 && (
                  <label className="mobile-collection">
                    Library
                    <select
                      value={collection}
                      onChange={(event) =>
                        onFilter('collection', event.target.value)
                      }
                    >
                      <option value="all">All libraries</option>
                      <option value="personal">Personal</option>
                      {collections.map((library) => (
                        <option key={library.id} value={library.id}>
                          {library.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Segments
                  label="Reading status"
                  value={status}
                  onChange={(value) => onFilter('status', value)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'unread', label: 'Unread' },
                    { value: 'reading', label: 'Reading' },
                    { value: 'finished', label: 'Finished' },
                  ]}
                />
                <Segments
                  label="Availability"
                  value={availability}
                  onChange={(value) => onFilter('availability', value)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'downloaded', label: 'Downloaded' },
                    { value: 'cloud', label: 'Not downloaded' },
                  ]}
                />
              </>
            )}
            {panel === 'Sort' && (
              <>
                <fieldset className="control-group sort-options">
                  <legend>Sort books</legend>
                  {[
                    ...sortOptions,
                    ...(series ? ([['volume', 'Volume']] as const) : []),
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name={sortName}
                        value={value}
                        checked={sort === value}
                        onChange={() =>
                          onChange({
                            ...preferences,
                            sort: value,
                            sortDirection: naturalSortDirection(value),
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="control-group sort-direction">
                  <legend>Direction</legend>
                  {(['asc', 'desc'] as const).map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name={directionName}
                        value={value}
                        checked={direction === value}
                        onChange={() =>
                          onChange({
                            ...preferences,
                            sort,
                            sortDirection: value,
                          })
                        }
                      />
                      <span>
                        {value === 'asc' ? 'Ascending' : 'Descending'}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {panel === 'View' && (
              <>
                {onHidden && (
                  <button
                    className="library-destination"
                    onClick={() => {
                      setPanel('');
                      onHidden();
                    }}
                  >
                    <EyeOff />
                    Hidden books
                    <ChevronRight className="menu-chevron" />
                  </button>
                )}
                <ViewOptions preferences={preferences} onChange={onChange} />
              </>
            )}
          </div>
        </OptionsPanel>
      )}
    </>
  );
}
