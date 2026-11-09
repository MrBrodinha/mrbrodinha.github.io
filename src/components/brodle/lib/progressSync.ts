import { emptyProgress, mergeProgress, parseProgress, serializeProgress } from './gameProgress';
import type { GameMode, GameProgress } from './gameProgress';

export type ProgressTransport = {
  load: (signal: AbortSignal) => Promise<GameProgress>;
  save: (progress: GameProgress, signal: AbortSignal) => Promise<GameProgress>;
};
export type ProgressSyncState = {
  progress: GameProgress;
  pending: boolean;
  loading: boolean;
  status: 'local' | 'loading' | 'saving' | 'saved' | 'error';
};

export function readProgressCache(raw: string | null, target: readonly number[], mode: GameMode = 'guided') {
  let pending = false;
  try { pending = JSON.parse(raw ?? 'null')?.pending === true; } catch { /* Restore any valid history below. */ }
  return { progress: parseProgress(raw, target, mode), pending };
}

export function serializeProgressCache(progress: GameProgress, pending: boolean) {
  return JSON.stringify({ ...JSON.parse(serializeProgress(progress)), pending });
}

// Each session belongs to one account, puzzle and mode; late responses are ignored
// after disposal. Save requests are serialized and merge append-only history.
export class ProgressSync {
  state: ProgressSyncState;
  private revision = 0;
  private running = false;
  private requested = false;
  private disposed = false;
  private abort = new AbortController();

  constructor(
    private target: readonly number[],
    initial: { progress: GameProgress; pending: boolean },
    private transport: ProgressTransport | undefined,
    private changed: (state: ProgressSyncState) => void,
    private mode: GameMode = 'guided',
  ) {
    this.state = { ...initial, loading: Boolean(transport), status: transport ? 'loading' : 'local' };
  }

  update(update: (previous: GameProgress) => GameProgress) {
    const previous = this.state.progress;
    if (this.disposed || this.state.loading) return { previous, next: previous };
    const next = update(previous);
    if (next === previous) return { previous, next };
    this.revision++;
    this.emit({ progress: parseProgress(serializeProgress(next), this.target, this.mode), pending: Boolean(this.transport), status: this.transport ? 'saving' : 'local' });
    void this.sync();
    return { previous, next: this.state.progress };
  }

  receive(progress: GameProgress, pending: boolean) {
    if (this.disposed) return;
    const merged = mergeProgress(progress, this.state.progress, this.target, this.state.pending, this.mode);
    if (serializeProgress(merged) === serializeProgress(this.state.progress)) return;
    this.revision++;
    this.emit({ progress: merged, pending: Boolean(this.transport) && (pending || this.state.pending) });
    if (pending) void this.sync();
  }

  async sync(): Promise<void> {
    if (this.disposed || !this.transport) return;
    if (this.running) { this.requested = true; return; }
    this.running = true;
    let failed = false;
    try {
      const remote = await this.transport.load(this.abort.signal);
      if (this.disposed) return;
      const remoteEmpty = remote.attempts.length === 0 && remote.guess.length === 0;
      const merged = mergeProgress(remote, this.state.progress, this.target, this.state.pending || remoteEmpty, this.mode);
      const needsSave = serializeProgress(merged) !== serializeProgress(remote);
      this.emit({ progress: merged, pending: needsSave, status: needsSave ? 'saving' : 'saved' });
      if (needsSave) {
        const revision = this.revision;
        const saved = await this.transport.save(merged, this.abort.signal);
        if (this.disposed) return;
        const edited = revision !== this.revision;
        this.emit({ progress: mergeProgress(saved, this.state.progress, this.target, edited, this.mode), pending: edited, loading: false, status: edited ? 'saving' : 'saved' });
        this.requested ||= edited;
      } else this.emit({ loading: false });
    } catch {
      if (!this.disposed) this.emit({ loading: false, status: 'error' });
      failed = true;
    } finally {
      this.running = false;
      const again = this.requested;
      this.requested = false;
      if (again && !failed && !this.disposed) void this.sync();
    }
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
  }

  private emit(change: Partial<ProgressSyncState>) {
    this.state = { ...this.state, ...change };
    this.changed(this.state);
  }
}

export const emptyProgressCache = () => ({ progress: emptyProgress(), pending: false });
