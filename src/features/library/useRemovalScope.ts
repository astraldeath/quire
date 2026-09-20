import { useEffect, useState } from 'react';
import { loadSync } from '../../storage';

/** A retained account still queues deletions while syncing is paused. */
export function useRemovalScope(active: boolean) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let live = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      setConnected(null);
      setError('');
      void loadSync()
        .then((state) => {
          if (live && request === revision) setConnected(!!state.account);
        })
        .catch(() => {
          if (live && request === revision)
            setError('Could not check removal scope. Close and try again.');
        });
    };
    refresh();
    window.addEventListener('quire-storage', refresh);
    return () => {
      live = false;
      window.removeEventListener('quire-storage', refresh);
    };
  }, [active]);
  return { connected, error };
}
