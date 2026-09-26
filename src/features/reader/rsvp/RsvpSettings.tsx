import { Play } from 'lucide-react';
import type { ReaderPreferences } from '../../../domain/models';
import {
  ColorControl,
  StepperControl,
  Switch,
} from '../../../components/Controls';
import { FocalWord } from './FocalWord';
import './rsvp.css';

export function RsvpSettings({
  preferences,
  onPreferences,
  onRsvp,
  previewing = false,
  fonts = [],
}: {
  preferences: ReaderPreferences;
  onPreferences(value: ReaderPreferences): void;
  onRsvp?(): void;
  previewing?: boolean;
  fonts?: { value: string; label: string }[];
}) {
  const patch = (value: Partial<ReaderPreferences>) =>
    onPreferences({ ...preferences, ...value });
  const fontOptions = [
    { value: 'Georgia', label: 'Serif' },
    { value: 'sans-serif', label: 'Sans serif' },
    { value: 'monospace', label: 'Monospace' },
    ...fonts,
  ];
  return (
    <div className="reader-settings rsvp-settings">
      <section className="rsvp-settings-group" aria-label="RSVP appearance">
        <h3>Appearance</h3>
        <label className="rsvp-font-control">
          Font
          <select
            aria-label="RSVP font"
            value={preferences.rsvpFont ?? 'Georgia'}
            onChange={(event) => patch({ rsvpFont: event.target.value })}
          >
            {fontOptions.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <StepperControl
          label="RSVP font size"
          min={24}
          max={96}
          step={2}
          value={preferences.rsvpSize ?? 40}
          unit=" px"
          onChange={(rsvpSize) => patch({ rsvpSize })}
        />
        <ColorControl
          label="Focal letter color"
          value={preferences.rsvpFocalColor ?? '#cf5563'}
          onChange={(rsvpFocalColor) => patch({ rsvpFocalColor })}
        />
        <Switch
          label="Alignment guides"
          checked={preferences.rsvpGuides === true}
          onChange={(rsvpGuides) => patch({ rsvpGuides })}
        />
        <div
          className={`rsvp-display rsvp-style-preview${preferences.rsvpGuides ? ' rsvp-display-guides' : ''}`}
          aria-label="RSVP preview"
        >
          <FocalWord
            word="Reading"
            size={preferences.rsvpSize ?? 40}
            font={preferences.rsvpFont ?? 'Georgia'}
            focalColor={preferences.rsvpFocalColor}
          />
        </div>
      </section>
      <section className="rsvp-settings-group" aria-label="RSVP pacing">
        <h3>Pacing</h3>
        <StepperControl
          label="Words per minute"
          min={60}
          max={1000}
          step={10}
          value={preferences.rsvpWpm ?? 250}
          onChange={(rsvpWpm) => patch({ rsvpWpm })}
        />
        <Switch
          label="Pause at punctuation"
          checked={preferences.rsvpPunctuationPauses !== false}
          onChange={(rsvpPunctuationPauses) => patch({ rsvpPunctuationPauses })}
        />
        {preferences.rsvpPunctuationPauses !== false && (
          <StepperControl
            label="Punctuation pause strength"
            min={0}
            max={3}
            step={0.25}
            value={preferences.rsvpPunctuationMultiplier ?? 1}
            unit="×"
            onChange={(rsvpPunctuationMultiplier) =>
              patch({ rsvpPunctuationMultiplier })
            }
          />
        )}
        <Switch
          label="Pause on long words"
          checked={preferences.rsvpLongWordPauses === true}
          onChange={(rsvpLongWordPauses) => patch({ rsvpLongWordPauses })}
        />
        {preferences.rsvpLongWordPauses && (
          <div className="stepper-group">
            <StepperControl
              label="Long word length"
              min={4}
              max={20}
              value={preferences.rsvpLongWordLength ?? 8}
              unit=" letters"
              onChange={(rsvpLongWordLength) => patch({ rsvpLongWordLength })}
            />
            <StepperControl
              label="Long word duration"
              min={1}
              max={3}
              step={0.25}
              value={preferences.rsvpLongWordMultiplier ?? 1.5}
              unit="×"
              onChange={(rsvpLongWordMultiplier) =>
                patch({ rsvpLongWordMultiplier })
              }
            />
          </div>
        )}
      </section>
      <button onClick={onRsvp} disabled={!onRsvp}>
        <Play size={18} />
        Open RSVP reader
      </button>
      {!onRsvp && (
        <p className="settings-note">
          {previewing
            ? 'Choose Continue here to start RSVP reading.'
            : 'Open a text chapter to use RSVP reading.'}
        </p>
      )}
    </div>
  );
}
