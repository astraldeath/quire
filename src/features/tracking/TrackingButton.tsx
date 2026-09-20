import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { trackingSession, trackingRequest } from './client';
import { ActionMenuItem } from '../../components/ActionMenuItem';
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
    const update = () => {
      void trackingSession()
        .then(async (session) => {
          const state = await trackingRequest(session, '/v1/tracking');
          if (alive)
            setLinked(
              state.links.some((l: { bookId: string; seriesKey: string }) =>
                series ? l.seriesKey === series : l.bookId === bookId,
              ),
            );
        })
        .catch(() => {});
    };
    update();
    window.addEventListener('quire-tracking', update);
    return () => {
      alive = false;
      window.removeEventListener('quire-tracking', update);
    };
  }, [bookId, series]);
  return (
    <ActionMenuItem
      menuId="tracking"
      type="button"
      className="text-action"
      onClick={onClick}
    >
      <Link2 />
      {linked ? '1 tracker' : 'Tracking'}
    </ActionMenuItem>
  );
}
