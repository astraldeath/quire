import { useId, useState } from 'react';
import {
  Check,
  Circle,
  Contrast,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  Sun,
} from 'lucide-react';
import './controls.css';
const themeOptions = {
  system: {
    label: 'System',
    icon: Monitor,
    background: 'linear-gradient(135deg,#f7f7f5 50%,#22262d 50%)',
    color: '#8595a9',
  },
  app: {
    label: 'Follow app',
    icon: Monitor,
    background: 'linear-gradient(135deg,#f7f7f5 50%,#22262d 50%)',
    color: '#8595a9',
  },
  light: { label: 'Light', icon: Sun, background: '#faf9f6', color: '#30343a' },
  dark: { label: 'Dark', icon: Moon, background: '#24272d', color: '#e7e5df' },
  onyx: {
    label: 'Onyx',
    icon: Circle,
    background: '#000000',
    color: '#d6d6d6',
  },
  contrast: {
    label: 'Contrast',
    icon: Contrast,
    background: '#000000',
    color: '#ffffff',
  },
  custom: {
    label: 'Custom',
    icon: Palette,
    background: 'var(--surface)',
    color: 'var(--fg)',
  },
};
export function ThemePicker<T extends keyof typeof themeOptions>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange(value: T): void;
}) {
  const name = useId();
  return (
    <fieldset className="control-group">
      <legend>{label}</legend>
      <div className={`theme-options theme-options-${options.length}`}>
        {options.map((key) => {
          const option = themeOptions[key];
          const Icon = option.icon;
          return (
            <label className="theme-option" key={key}>
              <input
                type="radio"
                name={name}
                value={key}
                checked={value === key}
                onChange={() => onChange(key)}
              />
              <span
                className="theme-swatch"
                style={{ background: option.background, color: option.color }}
              >
                <Icon />
                <Check className="theme-selected" />
              </span>
              <span className="theme-name">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
export function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  const name = useId();
  return (
    <fieldset className="control-group">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <span className="toggle-track">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}
export function StepperControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const parsed = text.trim() === '' ? NaN : Number(text);
    if (Number.isFinite(parsed))
      onChange(Math.min(max, Math.max(min, Math.round(parsed * 100) / 100)));
    setDraft(null);
  };
  const id = useId();
  const adjust = (delta: number) =>
    onChange(
      Math.min(max, Math.max(min, Math.round((value + delta) * 100) / 100)),
    );
  return (
    <div className="stepper-control" role="group" aria-labelledby={id}>
      <span id={id}>{label}</span>
      <div className="stepper-value">
        <input
          type="number"
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          aria-labelledby={id}
          min={min}
          max={max}
          step="any"
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.value = String(value);
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <span>{unit.trim()}</span>}
      </div>
      <div className="stepper-buttons">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => adjust(-step)}
        >
          <Minus />
        </button>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => adjust(step)}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
export function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className="color-control">
      <span>{label}</span>
      <span className="color-input">
        <span>{value.toUpperCase()}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </span>
    </label>
  );
}
