export function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>();

  async function* on(signal?: AbortSignal): AsyncGenerator<T> {
    const queue: Array<T> = [];
    let wake = () => {};
    const listener = (value: T) => {
      queue.push(value);
      wake();
    };
    listeners.add(listener);
    const aborted = new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    try {
      while (signal?.aborted !== true) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        await Promise.race([
          new Promise<void>((resolve) => (wake = resolve)),
          aborted,
        ]);
      }
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    } finally {
      listeners.delete(listener);
    }
  }

  return {
    on,
    emit(value: T) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    listenerCount: () => listeners.size,
  };
}
