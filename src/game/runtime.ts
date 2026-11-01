export const MAX_CATCH_UP_SECONDS = 72 * 60 * 60;

export class ElapsedClock {
  private last: number;
  private remainder = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.last = now();
  }

  reset(): void {
    this.last = this.now();
    this.remainder = 0;
  }

  take(paused = false): number {
    const current = this.now();
    const elapsed = Math.max(0, current - this.last);
    this.last = current;
    if (paused || !Number.isFinite(elapsed)) {
      this.remainder = 0;
      return 0;
    }
    this.remainder += elapsed;
    const seconds = Math.floor(this.remainder / 1000);
    this.remainder -= seconds * 1000;
    return seconds;
  }
}

interface AdvanceOptions {
  seconds: number;
  tick: (seconds: number) => void;
  signal?: AbortSignal;
  maxSeconds?: number;
  onProgress?: (advanced: number, total: number) => void;
  now?: () => number;
  yieldControl?: () => Promise<void>;
}

export interface AdvanceResult {
  advanced: number;
  total: number;
  cancelled: boolean;
}

// 不用 requestAnimationFrame 让出线程：页面在后台时 rAF 不运行，补算会永远等下一帧。
export async function advanceSimulation(options: AdvanceOptions): Promise<AdvanceResult> {
  const { seconds, tick, signal, onProgress } = options;
  const limit = options.maxSeconds ?? MAX_CATCH_UP_SECONDS;
  const total = Number.isFinite(seconds) && Number.isFinite(limit)
    ? Math.min(Math.max(0, seconds), Math.max(0, limit)) : 0;
  const now = options.now ?? (() => performance.now());
  const yieldControl = options.yieldControl ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  let advanced = 0;
  while (advanced < total && !signal?.aborted) {
    const started = now();
    let iterations = 0;
    do {
      if (signal?.aborted) break;
      const step = Math.min(1, total - advanced);
      tick(step);
      advanced += step;
      iterations++;
      // 单批限制在一个短时间片内，避免补算阻塞页面；较大的批次减少长时间补算时的调度开销。
    } while (advanced < total && now() - started < 24 && iterations < 240);
    onProgress?.(advanced, total);
    if (advanced < total && !signal?.aborted) await yieldControl();
  }
  return { advanced, total, cancelled: signal?.aborted ?? false };
}
