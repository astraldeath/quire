import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  registerNavigationBlocker,
  resumeDraftTransition,
} from '../features/navigation/blockers';
import { ConfirmDialog } from './ConfirmDialog';

export function useDraftGuard(options: { dirty: boolean; busy?: boolean }): {
  requestLeave(action: () => void): void;
  confirmation: ReactNode;
} {
  const latest = useRef(options);
  const pending = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const requestLeave = useCallback((action: () => void) => {
    if (latest.current.busy || pending.current) return;
    if (!latest.current.dirty) {
      action();
      return;
    }
    pending.current = action;
    setConfirming(true);
  }, []);
  useLayoutEffect(() => {
    if (!options.dirty) return;
    const unregister = registerNavigationBlocker(requestLeave);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [options.dirty, requestLeave]);
  useLayoutEffect(
    () => () => {
      pending.current = null;
    },
    [],
  );
  const cancel = () => {
    pending.current = null;
    setConfirming(false);
  };
  const confirm = () => {
    if (latest.current.busy) return;
    const action = pending.current;
    cancel();
    if (action) resumeDraftTransition(requestLeave, action);
  };
  return {
    requestLeave,
    confirmation: confirming ? (
      <ConfirmDialog
        title="Discard changes?"
        description="Your unsaved changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        danger
        busy={options.busy}
        onConfirm={confirm}
        onCancel={cancel}
      />
    ) : null,
  };
}
