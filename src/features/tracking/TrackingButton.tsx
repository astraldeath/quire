import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { loadSync } from '../../storage';
import { accountRequest } from '../sync/transport';
export function TrackingButton({
  bookId,
  series,
  onClick,
}: {
  bookId: string;
  series?: string;
  onClick(): void;
}) {
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadSync()
      .then(async (s) => {
        if (!s.enabled || !s.account) return;
        const state = await accountRequest(s.account, '/v1/tracking');
        if (alive)
          setLinked(
            state.links.some((l: { bookId: string; seriesKey: string }) =>
              series ? l.seriesKey === series : l.bookId === bookId,
            ),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bookId, series]);
  return (
    <button type="button" className="text-action" onClick={onClick}>
      <Link2 />
      {linked ? '1 tracker' : 'Tracking'}
    </button>
  );
}
