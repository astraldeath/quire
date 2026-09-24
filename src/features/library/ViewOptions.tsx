import { useId } from 'react';
import { Segments, Switch } from '../../components/Controls';
import type { Preferences } from '../../domain/models';

export function ViewOptions({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange(preferences: Preferences): void;
}) {
  const size = useId();
  return (
    <div className="view-options">
      <Segments
        label="Layout"
        value={preferences.view}
        onChange={(view) => onChange({ ...preferences, view })}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
      />
      <div className="cover-size-control">
        <div className="cover-size-heading">
          <label htmlFor={size}>Cover size</label>
          <output className="sr-only" htmlFor={size}>
            {preferences.coverSize} pixels
          </output>
        </div>
        <input
          id={size}
          type="range"
          min="110"
          max="210"
          step="1"
          value={preferences.coverSize}
          onChange={(event) =>
            onChange({ ...preferences, coverSize: Number(event.target.value) })
          }
        />
        <div className="cover-size-scale" aria-hidden="true">
          <span>Smaller</span>
          <span>Larger</span>
        </div>
      </div>
      <Switch
        label="Show books inside folders"
        checked={!!preferences.flatLibrary}
        onChange={(flatLibrary) => onChange({ ...preferences, flatLibrary })}
      />
      <Switch
        label="Group books into series"
        checked={preferences.groupSeries}
        onChange={(groupSeries) => onChange({ ...preferences, groupSeries })}
      />
    </div>
  );
}
