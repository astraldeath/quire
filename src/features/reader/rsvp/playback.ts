import type { RsvpToken } from './tokens';
export interface RsvpState {
  index: number;
  playing: boolean;
}
export function normalizeWpm(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(1000, Math.max(60, Math.round(value!)))
    : 250;
}
export class RsvpPlayback {
  private state: RsvpState;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private ended = false;
  private deadline = 0;
  private started = 0;
  private wpm: number;
  constructor(
    private tokens: RsvpToken[],
    wpm: number,
    private punctuationPauses: boolean,
    private onState: (state: RsvpState) => void,
    private onEnd: () => void,
    startIndex = 0,
    private onDwell?: (index: number, milliseconds: number) => void,
    private onTime?: (milliseconds: number) => void,
  ) {
    this.wpm = normalizeWpm(wpm);
    this.state = {
      index: Math.max(0, Math.min(tokens.length - 1, startIndex)),
      playing: false,
    };
  }
  private emit() {
    this.onState({ ...this.state });
  }
  private duration() {
    const token = this.tokens[this.state.index];
    let multiplier = 1;
    if (this.punctuationPauses && token) {
      if (/[,;:，；：]["'”’)]*$/u.test(token.text)) multiplier = 1.5;
      if (/[.!?。！？]["'”’)]*$/u.test(token.text)) multiplier = 2;
      if (token.paragraphEnd) multiplier = 2.5;
    }
    return (60000 / this.wpm) * multiplier;
  }
  private schedule() {
    const duration = this.duration();
    this.started = performance.now();
    this.deadline = this.started + duration;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.disposed || !this.state.playing) return;
      if (performance.now() - this.deadline > duration) {
        this.pause();
        return;
      }
      this.onTime?.(duration);
      this.onDwell?.(this.state.index, duration);
      if (this.state.index + 1 >= this.tokens.length) {
        this.ended = true;
        this.state.playing = false;
        this.emit();
        this.onEnd();
        return;
      }
      this.state.index++;
      this.emit();
      this.schedule();
    }, duration);
  }
  play() {
    if (
      this.disposed ||
      this.ended ||
      this.state.playing ||
      !this.tokens.length
    )
      return;
    this.state.playing = true;
    this.emit();
    this.schedule();
  }
  pause() {
    if (this.disposed) return;
    if (this.timer !== undefined) this.creditPartial();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.state.playing = false;
    this.emit();
  }
  rewindSentence() {
    this.pause();
    if (this.disposed || !this.tokens.length) return;
    let index = this.state.index;
    if (
      index > 0 &&
      this.tokens[index - 1].sentence !== this.tokens[index].sentence
    )
      index--;
    const sentence = this.tokens[index].sentence;
    while (index > 0 && this.tokens[index - 1].sentence === sentence) index--;
    this.state.index = index;
    this.ended = false;
    this.emit();
  }
  configure(wpm: number, punctuationPauses: boolean) {
    if (this.timer !== undefined) this.creditPartial();
    this.wpm = normalizeWpm(wpm);
    this.punctuationPauses = punctuationPauses;
    if (this.state.playing) {
      clearTimeout(this.timer);
      this.schedule();
    }
  }
  dispose() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.disposed = true;
    this.state.playing = false;
  }
  private creditPartial() {
    this.onTime?.(
      Math.max(0, Math.min(performance.now(), this.deadline) - this.started),
    );
  }
}
