import { useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Lock, Shield } from 'lucide-react';
import { usePrivacy } from './Privacy';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
export function PrivacyMenu({
  ids,
  onDone,
  initialOpen = false,
  onBack,
}: {
  ids: string[];
  onDone?: () => void;
  initialOpen?: boolean;
  onBack?: () => void;
}) {
  const privacy = usePrivacy();
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState('');
  const [anchor, setAnchor] = useState<ActionAnchor>();
  if (!open)
    return (
      <button
        disabled={!ids.length}
        onClick={(event) => {
          setAnchor(event.currentTarget.getBoundingClientRect());
          setOpen(true);
        }}
      >
        <Shield />
        Privacy
      </button>
    );
  const content = (
    <div
      className="book-action-list privacy-menu"
      role="group"
      aria-label="Book privacy"
    >
      <button
        onClick={() => {
          setOpen(false);
          onBack?.();
        }}
      >
        <ArrowLeft />
        Privacy
      </button>
      {(['normal', 'locked', 'hidden'] as const).map((mode, index) => {
        const Icon = [Eye, Lock, EyeOff][index];
        const selected = ids.every(
          (id) => (privacy.state.books[id] ?? 'normal') === mode,
        );
        return (
          <button
            key={mode}
            aria-pressed={selected}
            onClick={() => {
              void privacy
                .protect(ids, mode)
                .then((ok) => {
                  if (ok) {
                    setOpen(false);
                    onDone?.();
                  }
                })
                .catch((e) => setError(String(e)));
            }}
          >
            <Icon />
            {['Normal', 'Locked', 'Hidden'][index]}
            {selected && <Check className="privacy-check" />}
          </button>
        );
      })}
      {error && <p role="alert">{error}</p>}
    </div>
  );
  return initialOpen ? (
    content
  ) : (
    <ActionPopover
      title="Privacy"
      anchor={anchor}
      onClose={() => setOpen(false)}
    >
      {content}
    </ActionPopover>
  );
}
