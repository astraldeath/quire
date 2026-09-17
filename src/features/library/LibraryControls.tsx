import { useState } from 'react';
import {
  ListFilter,
  ArrowDownWideNarrow,
  Grid2X2,
  CheckSquare,
  X,
  ChevronRight,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { EyeOff } from 'lucide-react';
import { Segments, Switch, StepperControl } from '../../components/Controls';
import type { Preferences } from '../../domain/models';
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
  const sort =
    preferences.sort === 'recent'
      ? series
        ? 'volume'
        : 'last-read'
      : preferences.sort;
  return (
    <>
      <div className="library-tools">
        <button onClick={() => setPanel('Filters')} aria-label="Filter books">
          <ListFilter />
          Filters
          {(status !== 'all' ||
            availability !== 'all' ||
            collection !== 'all') && <span className="filter-dot" />}
        </button>
        <button onClick={() => setPanel('Sort')} aria-label="Sort books">
          <ArrowDownWideNarrow />
          Sort
        </button>
        <button
          onClick={() => setPanel('View')}
          aria-label="Library view options"
        >
          <Grid2X2 />
          View
        </button>
        <button aria-pressed={selecting} onClick={onSelect}>
          {selecting ? <X /> : <CheckSquare />}
          {selecting ? 'Done' : 'Select'}
        </button>
      </div>
      {panel && (
        <Modal title={panel} onClose={() => setPanel('')}>
          <div className="library-options">
            {panel === 'Filters' && (
              <>
                {collections.length > 0 && (
                  <label className="mobile-collection">
                    Library
                    <select
                      value={collection}
                      onChange={(e) => onFilter('collection', e.target.value)}
                    >
                      <option value="all">All libraries</option>
                      <option value="personal">Personal</option>
                      {collections.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Segments
                  label="Reading status"
                  value={status}
                  onChange={(v) => onFilter('status', v)}
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
                  onChange={(v) => onFilter('availability', v)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'downloaded', label: 'Downloaded' },
                    { value: 'cloud', label: 'Not downloaded' },
                  ]}
                />
              </>
            )}
            {panel === 'Sort' && (
              <div
                className="sort-options"
                role="group"
                aria-label="Sort books"
              >
                {[
                  ['last-read', 'Last read'],
                  ['added', 'Date added'],
                  ['title', 'Title'],
                  ['author', 'Author'],
                  ...(series ? [['volume', 'Volume']] : []),
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={sort === value}
                    onClick={() => {
                      onChange({
                        ...preferences,
                        sort: value as Preferences['sort'],
                      });
                      setPanel('');
                    }}
                  >
                    {label}
                    {sort === value && <CheckSquare />}
                  </button>
                ))}
              </div>
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
                <Segments
                  label="Layout"
                  value={preferences.view}
                  onChange={(view) => onChange({ ...preferences, view })}
                  options={[
                    { value: 'grid', label: 'Grid' },
                    { value: 'list', label: 'List' },
                  ]}
                />
                <StepperControl
                  label="Cover size"
                  min={110}
                  max={210}
                  step={10}
                  value={preferences.coverSize}
                  unit=" px"
                  onChange={(coverSize) =>
                    onChange({ ...preferences, coverSize })
                  }
                />
                <Switch
                  label="Group books into series"
                  checked={preferences.groupSeries}
                  onChange={(groupSeries) =>
                    onChange({ ...preferences, groupSeries })
                  }
                />
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
