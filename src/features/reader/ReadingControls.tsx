import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ReaderPreferences } from '../../domain/models';
import { StepperControl } from '../../components/Controls';
import {
  actionLabels,
  assignShortcut,
  defaultShortcuts,
  defaultTapZones,
  resolvedShortcuts,
  resolvedTapZones,
  shortcutOptions,
  type ReadingAction,
  type TapAction,
} from './control-mapping';

export function ReadingControls({
  preferences,
  onPreferences,
}: {
  preferences: ReaderPreferences;
  onPreferences(value: ReaderPreferences): void;
}) {
  const id = useId();
  const [notice, setNotice] = useState('');
  const zones = resolvedTapZones(preferences);
  const bindings = resolvedShortcuts(preferences);
  const patch = (value: Partial<ReaderPreferences>) =>
    onPreferences({ ...preferences, ...value });
  return (
    <div className="reader-settings">
      <fieldset className="control-group">
        <legend>Tap zones</legend>
        {(['left', 'center', 'right'] as const).map((zone) => (
          <label key={zone} htmlFor={`${id}-${zone}`}>
            {zone === 'left'
              ? 'Left side'
              : zone === 'right'
                ? 'Right side'
                : 'Center'}
            <select
              id={`${id}-${zone}`}
              value={zones[zone]}
              onChange={(event) =>
                patch({
                  tapZones: {
                    ...zones,
                    [zone]: event.target.value as TapAction,
                  },
                })
              }
            >
              <option value="prev">Previous page</option>
              <option value="next">Next page</option>
              <option value="controls">Toggle controls</option>
              <option value="none">None</option>
            </select>
          </label>
        ))}
        <StepperControl
          label="Side zone width"
          value={zones.sideWidth}
          min={10}
          max={45}
          step={5}
          unit="%"
          onChange={(sideWidth) => patch({ tapZones: { ...zones, sideWidth } })}
        />
        <p className="settings-note">
          Each side uses this width. Page actions reverse for right-to-left
          reading.
        </p>
        <button onClick={() => patch({ tapZones: { ...defaultTapZones } })}>
          <RotateCcw size={16} />
          Reset tap zones
        </button>
      </fieldset>
      <fieldset className="control-group">
        <legend>Keyboard shortcuts</legend>
        {(Object.keys(actionLabels) as ReadingAction[]).map((action) => (
          <label key={action} htmlFor={`${id}-${action}`}>
            {actionLabels[action]}
            <select
              id={`${id}-${action}`}
              value={bindings[action]}
              onChange={(event) => {
                const key = event.target.value;
                const previous = (
                  Object.keys(bindings) as ReadingAction[]
                ).find(
                  (other) => other !== action && key && bindings[other] === key,
                );
                patch({ shortcuts: assignShortcut(bindings, action, key) });
                setNotice(
                  previous ? `${actionLabels[previous]} shortcut cleared.` : '',
                );
              }}
            >
              {shortcutOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="settings-note">
          Assigning a used key clears its previous action. Shortcuts pause while
          typing.
        </p>
        <p role="status" aria-live="polite">
          {notice}
        </p>
        <button
          onClick={() => {
            patch({ shortcuts: { ...defaultShortcuts } });
            setNotice('Keyboard shortcuts reset.');
          }}
        >
          <RotateCcw size={16} />
          Reset shortcuts
        </button>
      </fieldset>
    </div>
  );
}
