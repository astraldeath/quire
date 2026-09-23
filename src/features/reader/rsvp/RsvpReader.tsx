import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw } from 'lucide-react';
import type { ReaderBook } from '../../../books';
import type { Position, ReaderPreferences } from '../../../domain/models';
import {
  chapterHrefAtRange,
  currentChapterAt,
  type BookStructure,
} from '../../../domain/book-structure';
import type { ReadingActivity } from '../../statistics/model';
import {
  RsvpPublication,
  rsvpSectionSize,
  type RsvpLocator,
  type RsvpSection,
} from './publication';
import { RsvpPlayback, normalizeWpm, type RsvpState } from './playback';
import { tokenRange } from './tokens';
import { RsvpActivity } from './activity';
import { StepperControl } from '../../../components/Controls';
import { FocalWord } from './FocalWord';
import './rsvp.css';
interface Props {
  bookId: string;
  volume: number | null;
  publication: ReaderBook;
  locator: RsvpLocator;
  structure: BookStructure;
  position?: Position;
  preferences: ReaderPreferences;
  onPreferences(preferences: ReaderPreferences): void;
  onPosition(position: Position): void;
  onActivity?(activity: ReadingActivity): void;
  onExit(position?: Position): void;
}
export function RsvpReader(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const controls = useRef<{
    toggle(): void;
    pause(): void;
    rewind(): void;
    exit(): void;
    configure(): void;
  } | null>(null);
  const [state, setState] = useState<RsvpState>({ index: 0, playing: false });
  const [word, setWord] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let closed = false;
    let resume = false;
    let section: RsvpSection | null = null;
    let player: RsvpPlayback | undefined;
    let currentState: RsvpState = { index: 0, playing: false };
    let position = props.position;
    let completedChapter = props.position?.completedChapter;
    let finished = false;
    let lastDwelledChapter: number | null = null;
    const activity = new RsvpActivity(props.bookId, props.volume);
    const publication = new RsvpPublication(props.publication, props.locator);
    const available = () =>
      document.visibilityState !== 'hidden' &&
      !document.querySelector(
        '.privacy-cover, [role="dialog"], #reader-contents',
      );
    const chapterAt = (s: RsvpSection, i: number) =>
      currentChapterAt(props.structure, {
        spineIndex: s.index,
        href: chapterHrefAtRange(
          props.structure,
          s.index,
          tokenRange(s.tokens[i]),
        ),
      });
    const complete = (chapter: number | null) => {
      activity.complete(chapter);
      if (chapter !== null)
        completedChapter = Math.max(completedChapter ?? 0, chapter);
    };
    const flush = () => {
      if (!section || closed) return position;
      const chapter = chapterAt(section, currentState.index);
      const detected = props.structure.chapters.find(
        (c) => c.number === chapter,
      );
      const sizes = props.publication.sections?.map(rsvpSectionSize) ?? [1];
      const total = sizes.reduce((a, b) => a + b, 0);
      position = {
        cfi: publication.cfi(section, currentState.index),
        fraction: finished
          ? 1
          : (sizes.slice(0, section.index).reduce((a, b) => a + b, 0) +
              (sizes[section.index] * currentState.index) /
                section.tokens.length) /
            total,
        section: detected?.label ?? position?.section ?? '',
        updatedAt: Date.now(),
        ...(chapter !== null ? { currentChapter: chapter } : {}),
        ...(completedChapter !== undefined ? { completedChapter } : {}),
      };
      props.onPosition(position);
      for (const record of activity.flush()) props.onActivity?.(record);
      return position;
    };
    const pause = () => {
      resume = false;
      player?.pause();
      flush();
    };
    const show = (s: RsvpSection, auto: boolean) => {
      if (closed) return;
      section = s;
      currentState = { index: s.tokenIndex, playing: false };
      const chapter = chapterAt(s, s.tokenIndex);
      setLabel(
        props.structure.chapters.find((c) => c.number === chapter)?.label ?? '',
      );
      setWord(s.tokens[s.tokenIndex].text);
      setState(currentState);
      setLoading(false);
      player = new RsvpPlayback(
        s.tokens,
        normalizeWpm(latest.current.preferences.rsvpWpm),
        latest.current.preferences.rsvpPunctuationPauses !== false,
        (state) => {
          if (closed) return;
          const previousChapter = chapterAt(s, currentState.index);
          currentState = state;
          setState(state);
          setWord(s.tokens[state.index].text);
          setLabel(
            props.structure.chapters.find(
              (c) => c.number === chapterAt(s, state.index),
            )?.label ?? '',
          );
          if (!state.playing || chapterAt(s, state.index) !== previousChapter)
            flush();
        },
        () => {
          void advance(s);
        },
        s.tokenIndex,
        (index) => {
          const chapter = chapterAt(s, index);
          lastDwelledChapter = chapter;
          if (
            index + 1 < s.tokens.length &&
            chapterAt(s, index + 1) !== chapter
          )
            complete(chapter);
        },
        (milliseconds) => activity.add(milliseconds),
      );
      if (auto && resume && available()) player.play();
    };
    const advance = async (previous: RsvpSection) => {
      resume = true;
      setLoading(true);
      try {
        const next = await publication.next(previous.index + 1);
        if (closed) return;
        if (!next || chapterAt(next, 0) !== lastDwelledChapter)
          complete(lastDwelledChapter);
        if (!next) {
          finished = true;
          activity.finish();
          flush();
          setLoading(false);
          resume = false;
          return;
        }
        flush();
        player?.dispose();
        show(next, true);
        flush();
      } catch {
        if (!closed) {
          resume = false;
          setLoading(false);
          setError(
            'Could not load the next section. Return to the page and try again.',
          );
        }
      }
    };
    controls.current = {
      pause,
      toggle: () => {
        if (currentState.playing) pause();
        else if (available()) {
          resume = true;
          player?.play();
        }
      },
      rewind: () => {
        resume = false;
        finished = false;
        player?.rewindSentence();
        flush();
      },
      exit: () => {
        pause();
        const saved = flush();
        closed = true;
        player?.dispose();
        publication.dispose();
        latest.current.onExit(saved);
      },
      configure: () =>
        player?.configure(
          normalizeWpm(latest.current.preferences.rsvpWpm),
          latest.current.preferences.rsvpPunctuationPauses !== false,
        ),
    };
    const obscure = () => {
      if (!available()) pause();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as Element)?.closest(
          'input, textarea, select, button, [contenteditable="true"]',
        )
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        controls.current?.toggle();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        controls.current?.exit();
      }
    };
    const observer = new MutationObserver(obscure);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'role'],
    });
    document.addEventListener('visibilitychange', obscure);
    window.addEventListener('pagehide', pause);
    window.addEventListener('blur', pause);
    window.addEventListener('keydown', keyboard);
    const interval = setInterval(() => {
      if (currentState.playing) {
        obscure();
        flush();
      }
    }, 5000);
    void publication
      .open(props.position?.cfi)
      .then((s) => {
        if (closed) return;
        if (!s) {
          setError('No readable text is available in this book.');
          setLoading(false);
          return;
        }
        show(s, false);
        playButton.current?.focus();
      })
      .catch(() => {
        if (!closed) {
          setError(
            'Could not load this reading position. Return to the page and try again.',
          );
          setLoading(false);
        }
      });
    return () => {
      pause();
      closed = true;
      player?.dispose();
      publication.dispose();
      controls.current = null;
      clearInterval(interval);
      observer.disconnect();
      document.removeEventListener('visibilitychange', obscure);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('blur', pause);
      window.removeEventListener('keydown', keyboard);
    };
    // A reading session owns its initial CFI; normal saves must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookId, props.publication, props.locator]);
  useEffect(() => {
    controls.current?.configure();
  }, [props.preferences.rsvpWpm, props.preferences.rsvpPunctuationPauses]);
  return (
    <section className="rsvp-reader" aria-label="RSVP reading">
      <header className="rsvp-header">
        <button
          aria-label="Back to page"
          onClick={() => controls.current?.exit()}
        >
          <ArrowLeft size={20} />
          Back to page
        </button>
        <span>{label}</span>
      </header>
      <div className="rsvp-display" aria-live="off">
        <FocalWord word={word} size={props.preferences.size} />
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading text…</p>}
      <div className="rsvp-controls">
        <button
          aria-label="Rewind sentence"
          title="Rewind sentence"
          disabled={loading || !word}
          onClick={() => controls.current?.rewind()}
        >
          <RotateCcw size={22} />
        </button>
        <button
          ref={playButton}
          aria-label={state.playing ? 'Pause' : 'Play'}
          disabled={loading || !word || !!error}
          onClick={() => controls.current?.toggle()}
        >
          {state.playing ? <Pause size={24} /> : <Play size={24} />}
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <StepperControl
          label="Words per minute"
          value={normalizeWpm(props.preferences.rsvpWpm)}
          min={60}
          max={1000}
          step={10}
          onChange={(value) =>
            props.onPreferences({
              ...props.preferences,
              rsvpWpm: normalizeWpm(value),
            })
          }
        />
      </div>
    </section>
  );
}
