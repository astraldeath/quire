import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { Preferences, ReaderPreferences } from '../../domain/models';
import { importReadingFont } from './customization';

export interface ReadingCustomization {
  preferences: Preferences;
  onChange(value: Preferences | ((current: Preferences) => Preferences)): void;
  bookId: string;
}

export function SavedReadingStyles({
  kind,
  customization,
  reader,
  onApply,
}: {
  kind: 'preset' | 'theme';
  customization: ReadingCustomization;
  reader: ReaderPreferences;
  onApply(value: ReaderPreferences): void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const { preferences: p, onChange } = customization;
  const items =
    kind === 'preset' ? (p.readingPresets ?? []) : (p.readingThemes ?? []);
  const label = kind === 'preset' ? 'preset' : 'theme';
  return (
    <fieldset className="control-group saved-reading-styles">
      <legend>Saved {label}s</legend>
      <div className="reading-style-row">
        <select
          aria-label={`Saved ${label}`}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a {label}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          disabled={!items.some((i) => i.id === selected)}
          onClick={() => {
            if (kind === 'preset') {
              const item = p.readingPresets?.find((i) => i.id === selected);
              if (item) onApply({ ...item.settings });
            } else {
              const item = p.readingThemes?.find((i) => i.id === selected);
              if (item)
                onApply({
                  ...reader,
                  theme: 'custom',
                  background: item.background,
                  foreground: item.foreground,
                  linkColor: item.linkColor,
                });
            }
          }}
        >
          Apply
        </button>
        <button
          aria-label={`Delete selected ${label}`}
          disabled={!selected}
          onClick={() => {
            onChange(
              kind === 'preset'
                ? {
                    ...p,
                    readingPresets: p.readingPresets?.filter(
                      (i) => i.id !== selected,
                    ),
                  }
                : {
                    ...p,
                    readingThemes: p.readingThemes?.filter(
                      (i) => i.id !== selected,
                    ),
                  },
            );
            setSelected('');
          }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      <form
        className="reading-style-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || items.length >= 100) return;
          const id = crypto.randomUUID();
          onChange(
            kind === 'preset'
              ? {
                  ...p,
                  readingPresets: [
                    ...(p.readingPresets ?? []),
                    { id, name: name.trim(), settings: { ...reader } },
                  ],
                }
              : {
                  ...p,
                  readingThemes: [
                    ...(p.readingThemes ?? []),
                    {
                      id,
                      name: name.trim(),
                      background: reader.background,
                      foreground: reader.foreground,
                      linkColor: reader.linkColor ?? reader.foreground,
                    },
                  ],
                },
          );
          setName('');
          setSelected(id);
        }}
      >
        <input
          aria-label={`New ${label} name`}
          placeholder={`New ${label} name`}
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={!name.trim() || items.length >= 100}>
          <Plus size={18} />
          Save current
        </button>
      </form>
    </fieldset>
  );
}

export function CustomFontSettings({
  customization,
}: {
  customization: ReadingCustomization;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { preferences: p, onChange } = customization;
  return (
    <details className="custom-font-settings">
      <summary>Manage fonts</summary>
      <label className="field">
        Import font
        <input
          type="file"
          accept=".ttf,.otf"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              const imported = (await importReadingFont(file, []))[0];
              onChange((current) => {
                const fonts = current.customFonts ?? [];
                if (fonts.some((font) => font.id === imported.id))
                  return current;
                if (
                  fonts.length >= 20 ||
                  fonts.reduce((size, font) => size + font.data.length, 0) +
                    imported.data.length >
                    16 * 1024 * 1024
                )
                  throw new Error(
                    'Remove an unused custom font before importing another.',
                  );
                return { ...current, customFonts: [...fonts, imported] };
              });
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Could not import font.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && (
        <p role="status">
          <Upload size={16} />
          Importing font...
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {p.customFonts?.map((font) => (
        <div className="reading-style-row" key={font.id}>
          <span>{font.name}</span>
          <button
            aria-label={`Remove ${font.name}`}
            onClick={() => {
              const clean = <T extends Partial<ReaderPreferences>>(
                r: T,
              ): T => ({
                ...r,
                ...(r.font === font.id ? { font: 'Georgia' } : {}),
                ...(r.rsvpFont === font.id ? { rsvpFont: 'Georgia' } : {}),
              });
              onChange({
                ...p,
                customFonts: p.customFonts?.filter((f) => f.id !== font.id),
                reader: clean(p.reader),
                bookReaderOverrides: Object.fromEntries(
                  Object.entries(p.bookReaderOverrides ?? {}).map(([id, r]) => [
                    id,
                    clean(r),
                  ]),
                ),
                readingPresets: p.readingPresets?.map((preset) => ({
                  ...preset,
                  settings: clean(preset.settings),
                })),
              });
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
    </details>
  );
}
