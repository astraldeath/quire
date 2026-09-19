import { useEffect, useState } from 'react';
import { CloudAlert } from 'lucide-react';
import { loadSync } from '../../storage';
import { conflictsForReview } from './model';
import { subscribe } from './engine';
import './sync-notice.css';

export function SyncNotice({ onOpen }: { onOpen(): void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      try {
        const state = await loadSync();
        if (live && request === revision)
          setCount(state.enabled ? conflictsForReview(state).length : 0);
      } catch {
        // Keep an existing notice if storage is temporarily unavailable.
      }
    };
    void refresh();
    const stop = subscribe(() => void refresh());
    window.addEventListener('quire-synced', refresh);
    return () => {
      live = false;
      stop();
      window.removeEventListener('quire-synced', refresh);
    };
  }, []);
  if (!count) return null;
  return (
    <div className="sync-notice" role="status">
      <CloudAlert aria-hidden="true" />
      <span>
        {count} sync {count === 1 ? 'conflict needs' : 'conflicts need'} review
      </span>
      <button onClick={onOpen}>Review conflicts</button>
    </div>
  );
}
