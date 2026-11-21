/**
 * A click on every beat (a higher one on each loop's first beat), so the
 * performer can feel the tempo, from Web Audio. The AudioContext is made on
 * the first click, inside the user's gesture that started the lesson.
 */

export interface AudioLike {
  currentTime: number;
  destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  close(): Promise<void>;
}

export class Metronome {
  private audio: AudioLike | null = null;
  private lastBeat = Number.NEGATIVE_INFINITY;

  constructor(private readonly makeAudio: () => AudioLike = () => new AudioContext() as unknown as AudioLike) {}

  /** Clicks when `beat` has reached a new whole beat since the last call. */
  update(beat: number, beatsPerLoop: number): void {
    const whole = Math.floor(beat);
    if (whole <= this.lastBeat) return;
    const first = this.lastBeat === Number.NEGATIVE_INFINITY;
    this.lastBeat = whole;
    if (first && beat - whole > 0.1) return; // joined mid-beat: wait for the next
    this.click(((whole % beatsPerLoop) + beatsPerLoop) % beatsPerLoop === 0);
  }

  click(accent: boolean): void {
    this.audio ??= this.makeAudio();
    const audio = this.audio;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime;
    oscillator.frequency.value = accent ? 1760 : 1175;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.1);
  }

  dispose(): void {
    void this.audio?.close();
    this.audio = null;
  }
}
