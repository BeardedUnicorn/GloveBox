/**
 * The lesson's beat over time. Tempo changes and pauses re-anchor the clock
 * so the motion never jumps, and the history they leave lets the scorer ask
 * what beat it was at a moment already past (a camera frame's capture time,
 * or that time less the performer's lag).
 */

interface Segment {
  /** When it began, ms. */
  t: number;
  /** The beat then. */
  beat: number;
  /** Beats per ms from then on: 0 while paused. */
  rate: number;
}

/** How many tempo changes and pauses are remembered: far more than the scorer's lag window needs. */
const HISTORY = 64;

export class LessonClock {
  private segments: Segment[];
  private tempoValue: number;
  private pausedValue = false;

  /**
   * @param bpm the lesson's tempo at 1×
   * @param t when the clock starts, ms
   * @param startBeat the beat at `t`: negative for a count-in before the lesson's first beat
   */
  constructor(
    private readonly bpm: number,
    t: number,
    tempo = 1,
    startBeat = 0
  ) {
    this.tempoValue = tempo;
    this.segments = [{ t, beat: startBeat, rate: this.rateFor(tempo) }];
  }

  private rateFor(tempo: number): number {
    return (this.bpm * tempo) / 60_000;
  }

  /** The segment in force at `t`: the last one that began by then, or the first. */
  private segmentAt(t: number): Segment {
    for (let i = this.segments.length - 1; i > 0; i--) {
      const segment = this.segments[i]!;
      if (segment.t <= t) return segment;
    }
    return this.segments[0]!;
  }

  /** The beat at `t` (ms); before the clock started, it runs backward at the starting rate. */
  beatAt(t: number): number {
    const segment = this.segmentAt(t);
    return segment.beat + (t - segment.t) * segment.rate;
  }

  private push(t: number, rate: number): void {
    this.segments.push({ t, beat: this.beatAt(t), rate });
    if (this.segments.length > HISTORY) this.segments.shift();
  }

  get tempo(): number {
    return this.tempoValue;
  }

  get paused(): boolean {
    return this.pausedValue;
  }

  /** Plays at `tempo` × the lesson's bpm from `t` on. */
  setTempo(tempo: number, t: number): void {
    this.tempoValue = tempo;
    if (!this.pausedValue) this.push(t, this.rateFor(tempo));
  }

  pause(t: number): void {
    if (this.pausedValue) return;
    this.pausedValue = true;
    this.push(t, 0);
  }

  resume(t: number): void {
    if (!this.pausedValue) return;
    this.pausedValue = false;
    this.push(t, this.rateFor(this.tempoValue));
  }

  /** ms per beat at the current tempo. */
  get msPerBeat(): number {
    return 1 / this.rateFor(this.tempoValue);
  }
}
