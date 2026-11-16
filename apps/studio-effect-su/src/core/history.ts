export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 40) {
    this.maxEntries = maxEntries;
  }

  push(snapshot: T): void {
    this.past.push(structuredClone(snapshot));
    if (this.past.length > this.maxEntries) {
      this.past.shift();
    }
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(structuredClone(current));
    return structuredClone(prev);
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(structuredClone(current));
    return structuredClone(next);
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
