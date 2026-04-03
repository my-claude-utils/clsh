/**
 * Demo mode animation engine.
 *
 * Types commands character-by-character with realistic timing variance,
 * streams output instantly, and supports looping playback.
 */

export interface DemoStep {
  /** Delay before starting this step (ms) */
  delay: number;
  /** Text to type character by character (simulates typing) */
  type?: string;
  /** Text to write instantly (simulates command output) */
  output?: string;
  /** Typing speed in ms per character (default 50) */
  speed?: number;
}

export interface DemoScript {
  steps: DemoStep[];
  /** Whether to loop the script after completion */
  loop?: boolean;
  /** Delay before restarting loop (ms) */
  loopDelay?: number;
}

/**
 * Plays a pre-scripted terminal animation by writing characters into a
 * terminal via the provided `write` callback.
 *
 * Usage:
 * ```ts
 * const engine = new DemoEngine((data) => terminal.write(data));
 * const stop = engine.play(shellScript);
 * // Later:
 * stop(); // cancels all pending timeouts
 * ```
 */
export class DemoEngine {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private cancelled = false;

  constructor(private write: (data: string) => void) {}

  /**
   * Play a demo script. Returns a cleanup function to stop playback.
   *
   * Each step is scheduled relative to the completion of the previous step:
   * - `delay` ms pause before the step begins
   * - `type` writes one character at a time with randomized timing
   * - `output` writes the entire string at once
   */
  play(script: DemoScript): () => void {
    this.cancelled = false;
    this.timers = [];

    this.runSteps(script, 0, 0);

    return () => {
      this.cancelled = true;
      for (const timer of this.timers) {
        clearTimeout(timer);
      }
      this.timers = [];
    };
  }

  /**
   * Schedule and run steps sequentially starting from `stepIndex`.
   * `offset` is the cumulative delay in ms from the start of playback.
   */
  private runSteps(script: DemoScript, stepIndex: number, offset: number): void {
    if (this.cancelled) return;

    if (stepIndex >= script.steps.length) {
      // All steps complete -- loop or stop
      if (script.loop) {
        const loopDelay = script.loopDelay ?? 3000;
        const timer = setTimeout(() => {
          if (!this.cancelled) {
            this.runSteps(script, 0, 0);
          }
        }, loopDelay);
        this.timers.push(timer);
      }
      return;
    }

    const step = script.steps[stepIndex];
    const stepStart = offset + step.delay;

    if (step.type !== undefined) {
      // Type character by character
      const baseSpeed = step.speed ?? 50;
      let charOffset = stepStart;

      for (let i = 0; i < step.type.length; i++) {
        const char = step.type[i];
        // Add random variance of +/- 20ms for realism
        const variance = (Math.random() - 0.5) * 40;
        const charDelay = Math.max(10, baseSpeed + variance);

        const timer = setTimeout(() => {
          if (!this.cancelled) {
            this.write(char);
          }
        }, charOffset);
        this.timers.push(timer);

        charOffset += charDelay;
      }

      // Continue to next step after typing completes
      const nextOffset = charOffset;
      const timer = setTimeout(() => {
        if (!this.cancelled) {
          this.runSteps(script, stepIndex + 1, 0);
        }
      }, nextOffset);
      this.timers.push(timer);
    } else if (step.output !== undefined) {
      // Write output all at once after the delay
      const timer = setTimeout(() => {
        if (!this.cancelled) {
          this.write(step.output as string);
          this.runSteps(script, stepIndex + 1, 0);
        }
      }, stepStart);
      this.timers.push(timer);
    } else {
      // No type or output -- just wait the delay then move on
      const timer = setTimeout(() => {
        if (!this.cancelled) {
          this.runSteps(script, stepIndex + 1, 0);
        }
      }, stepStart);
      this.timers.push(timer);
    }
  }
}
