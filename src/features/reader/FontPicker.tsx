import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Modal } from '../../components/Modal';
import {
  canListSystemFonts,
  nativeFonts,
  systemFontName,
  systemFonts,
} from './system-fonts';
import { fontFamily } from './customization';
import './font-picker.css';
type Choice = { value: string; label: string };
export function FontPicker({
  value,
  onChange,
  imported = [],
  rsvp = false,
}: {
  value: string;
  onChange(value: string): void;
  imported?: Choice[];
  rsvp?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [families, setFamilies] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const defaults: Choice[] = rsvp
    ? [
        { value: 'Georgia', label: 'Serif' },
        { value: 'sans-serif', label: 'Sans serif' },
        { value: 'monospace', label: 'Monospace' },
      ]
    : [
        { value: 'publisher', label: 'Publisher' },
        { value: 'Georgia', label: 'Serif' },
        { value: 'sans-serif', label: 'Sans serif' },
      ];
  const selected =
    [...defaults, ...imported].find((f) => f.value === value)?.label ??
    systemFontName(value) ??
    'Unavailable font';
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setFamilies(await systemFonts());
      setLoaded(true);
    } catch {
      setError('Could not access system fonts. Retry or import a font.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open && nativeFonts() && !loaded) void load();
  }, [open]);
  const filter = (items: Choice[]) =>
    items.filter((f) =>
      f.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
    );
  const group = (title: string, items: Choice[]) => (
    <section className="font-picker-group" aria-label={title}>
      <h3>{title}</h3>
      {filter(items).map((f) => (
        <button
          type="button"
          key={f.value}
          aria-pressed={value === f.value}
          onClick={() => {
            onChange(f.value);
            close();
          }}
        >
          <span style={{ fontFamily: fontFamily(f.value) }}>{f.label}</span>
          {value === f.value && <Check size={18} />}
        </button>
      ))}
    </section>
  );
  const visible = filter([
    ...defaults,
    ...imported,
    ...families.map((f) => ({ value: 'system:' + f, label: f })),
  ]).length;
  return (
    <div className="font-picker">
      <span id={rsvp ? 'rsvp-font-label' : 'reading-font-label'}>Font</span>
      <button
        type="button"
        ref={trigger}
        className="font-picker-trigger"
        aria-label={rsvp ? 'RSVP font' : 'Font'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <span>{selected}</span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Modal
              title={rsvp ? 'RSVP font' : 'Choose font'}
              onClose={close}
              initialFocus={search}
              className="font-picker-dialog"
            >
              <label className="font-picker-search">
                <Search size={18} />
                <input
                  ref={search}
                  aria-label="Search fonts"
                  placeholder="Search fonts"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="font-picker-list">
                {group('Defaults', defaults)}
                {group(
                  'System fonts',
                  families.map((f) => ({ value: 'system:' + f, label: f })),
                )}
                {!loaded && !loading && canListSystemFonts() && (
                  <button
                    type="button"
                    className="font-picker-load"
                    onClick={() => void load()}
                  >
                    {error ? 'Retry system fonts' : 'Load system fonts'}
                  </button>
                )}
                {loading && <p role="status">Loading fonts...</p>}
                {error && <p role="alert">{error}</p>}
                {!canListSystemFonts() && (
                  <p className="settings-note">
                    This browser cannot list system fonts. Import a font to use
                    it here.
                  </p>
                )}
                {loaded && !families.length && (
                  <p className="settings-note">No system fonts were found.</p>
                )}
                {imported.length > 0 && group('Imported fonts', imported)}
                {!visible && query.trim() && (
                  <p role="status">No matching fonts.</p>
                )}
              </div>
            </Modal>
          </div>,
          trigger.current?.closest('.reader') ?? document.body,
        )}
    </div>
  );
}
