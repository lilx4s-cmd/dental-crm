type Priority = 'live' | 'history';
type Batch = {
  items: readonly unknown[];
  index: number;
  run: (item: unknown) => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

/** One database writer per connection; live events can pass queued history between items. */
export class IngestionQueue {
  private batches: Record<Priority, Batch[]> = { live: [], history: [] };
  private counts: Record<Priority, number> = { live: 0, history: 0 };
  private worker: Promise<void> | null = null;

  pending(priority: Priority) { return this.counts[priority]; }

  enqueue<T>(items: readonly T[], run: (item: T) => Promise<void>, priority: Priority): Promise<void> {
    if (!items.length) return this.idle();
    const completion = new Promise<void>((resolve, reject) => {
      this.batches[priority].push({ items, index: 0, run: item => run(item as T), resolve, reject });
      this.counts[priority] += items.length;
    });
    this.worker ??= Promise.resolve().then(() => this.drain());
    return completion;
  }

  async idle(): Promise<void> {
    while (this.worker) await this.worker;
  }

  private async drain(): Promise<void> {
    try {
      while (this.batches.live.length || this.batches.history.length) {
        const priority: Priority = this.batches.live.length ? 'live' : 'history';
        const batch = this.batches[priority][0];
        const item = batch.items[batch.index++];
        try {
          await batch.run(item);
        } catch (error) {
          // A failed batch must not poison later captures or leave idle() waiting forever.
          this.counts[priority] -= batch.items.length - batch.index;
          batch.index = batch.items.length;
          batch.reject(error);
        } finally {
          this.counts[priority] -= 1;
        }
        if (batch.index === batch.items.length) {
          this.batches[priority].shift();
          batch.resolve();
        }
      }
    } finally {
      this.worker = null;
    }
  }
}
