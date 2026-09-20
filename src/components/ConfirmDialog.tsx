import { useLayoutEffect, useRef } from 'react';
import { Modal } from './Modal';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(
    () => () => {
      // Wait until the modal leaves the top layer; while it remains there the
      // browser correctly refuses focus in the underlying editor.
      queueMicrotask(() => {
        if (previousFocus.current?.isConnected)
          previousFocus.current.focus({ preventScroll: true });
      });
    },
    [],
  );
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onCancel();
      }}
      initialFocus={cancel}
      className="confirm-dialog"
    >
      <p>{description}</p>
      <div className="confirm-actions">
        <button type="button" ref={cancel} disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'danger' : 'primary'}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
