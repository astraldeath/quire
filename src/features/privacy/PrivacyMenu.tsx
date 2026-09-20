import { useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Lock, Shield } from 'lucide-react';
import { usePrivacy } from './Privacy';
import { ActionMenuItem } from '../../components/ActionMenuItem';
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
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
            element: event.currentTarget,
          });
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
      <ActionMenuItem
        menuId="back"
        onClick={() => {
          setOpen(false);
          onBack?.();
        }}
      >
        <ArrowLeft />
        Privacy
      </ActionMenuItem>
      {(['normal', 'locked', 'hidden'] as const).map((mode, index) => {
        const Icon = [Eye, Lock, EyeOff][index];
        const selected = ids.every(
          (id) => (privacy.state.books[id] ?? 'normal') === mode,
        );
        return (
          <ActionMenuItem
            key={mode}
            menuId={mode}
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
            <span className="privacy-menu-label">
              <span>{['Normal', 'Locked', 'Hidden'][index]}</span>
              <small>
                {
                  [
                    'Visible in your library',
                    'Unlock to open',
                    'Shown only in Hidden books',
                  ][index]
                }
              </small>
            </span>
            {selected && <Check className="privacy-check" />}
          </ActionMenuItem>
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
      pageKey="privacy"
      initialItem="normal"
      onClose={() => setOpen(false)}
    >
      {content}
    </ActionPopover>
  );
}
