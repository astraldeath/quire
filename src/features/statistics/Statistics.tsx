import { useEffect, useState } from 'react';
import { BookOpen, Library, Layers, ListOrdered, Info } from 'lucide-react';
import type { Book } from '../../domain/models';
import { Segments } from '../../components/Controls';
import { listReadingActivity } from '../../storage';
import {
  aggregateStatistics,
  type ReadingActivity,
  type StatisticsPeriod,
} from './model';
import './statistics.css';

function readingTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function Statistics({ books }: { books: Book[] }) {
  const [period, setPeriod] = useState<StatisticsPeriod>('all');
  const [records, setRecords] = useState<ReadingActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState<'time' | 'speed' | null>(null);
  useEffect(() => {
    let disposed = false;
    const load = () =>
      void listReadingActivity()
        .then((items) => {
          if (!disposed) {
            setRecords(items);
            setError('');
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!disposed)
            setError(
              'Could not load reading history. Reopen Statistics to retry.',
            );
        });
    load();
    window.addEventListener('quire-statistics', load);
    return () => {
      disposed = true;
      window.removeEventListener('quire-statistics', load);
    };
  }, []);
  const stats = aggregateStatistics(books, records, period);
  const number = (n: number) => n.toLocaleString();
  return (
    <section className="statistics" aria-label="Reading statistics">
      <section aria-labelledby="statistics-library">
        <h3 id="statistics-library">Your library</h3>
        <dl className="statistics-grid">
          <div>
            <dt>
              <BookOpen />
              Books
            </dt>
            <dd>{number(stats.books)}</dd>
          </div>
          <div>
            <dt>
              <Library />
              Series
            </dt>
            <dd>{number(stats.series)}</dd>
          </div>
        </dl>
        <dl className="statistics-status">
          <div>
            <dt>Unread</dt>
            <dd>{number(stats.unread)}</dd>
          </div>
          <div>
            <dt>Reading</dt>
            <dd>{number(stats.reading)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{number(stats.finished)}</dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="statistics-history">
        <h3 id="statistics-history">Reading history</h3>
        <Segments
          label="Reading history period"
          value={period}
          onChange={(value) => setPeriod(value as StatisticsPeriod)}
          options={[
            { value: 'all', label: 'All time' },
            { value: 'year', label: 'This year' },
            { value: 'month', label: 'This month' },
          ]}
        />
        {error ? (
          <p role="alert">{error}</p>
        ) : !loaded ? (
          <p role="status" className="muted">
            Loading history…
          </p>
        ) : (
          <>
            <dl className="statistics-grid">
              <div>
                <dt>
                  <ListOrdered />
                  Chapters read
                </dt>
                <dd>{number(stats.chapters)}</dd>
              </div>
              <div>
                <dt>
                  <Layers />
                  Volumes read
                </dt>
                <dd>{number(stats.volumes)}</dd>
              </div>
              <div>
                <dt>
                  Reading time
                  <button
                    className="statistics-info"
                    aria-label="About reading time"
                    aria-expanded={hint === 'time'}
                    onClick={() => setHint(hint === 'time' ? null : 'time')}
                  >
                    <Info />
                  </button>
                </dt>
                <dd>{readingTime(stats.activeMs)}</dd>
                {hint === 'time' && (
                  <dd className="statistics-hint">
                    Counts active reading. Pauses while idle or in the
                    background.
                  </dd>
                )}
              </div>
              <div>
                <dt>
                  Reading speed
                  <button
                    className="statistics-info"
                    aria-label="About reading speed"
                    aria-expanded={hint === 'speed'}
                    onClick={() => setHint(hint === 'speed' ? null : 'speed')}
                  >
                    <Info />
                  </button>
                </dt>
                <dd>
                  {stats.wordsPerMinute === null ? (
                    <span className="muted">Not measured yet</span>
                  ) : (
                    <>
                      {number(stats.wordsPerMinute)} <small>words/min</small>
                    </>
                  )}
                </dd>
                {hint === 'speed' && (
                  <dd className="statistics-hint">
                    Estimated from timed page turns.
                  </dd>
                )}
              </div>
            </dl>
          </>
        )}
      </section>
    </section>
  );
}
