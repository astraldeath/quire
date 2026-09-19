interface Section {
  load(): Promise<string> | string;
  unload?(): void;
}

/** Own one underlying reference per section, shared by prefetch and Foliate.
 * Calling EPUB's original load again would add a reference that a single
 * renderer unload cannot release. Keep the wrapper installed after disposal
 * so late navigation cannot restart a closed publication.
 */
export function bufferSections(sections: Section[]) {
  const originals = sections.map((section) => ({
    load: section.load.bind(section),
    unload: section.unload?.bind(section),
  }));
  const entries = new Map<
    number,
    {
      promise: Promise<string>;
      loaded: boolean;
      inUse: boolean;
      start?: () => Promise<void>;
    }
  >();
  let current = -1;
  let closed = false;
  let disposal: Promise<void> | undefined;
  let running = false;
  const pump = () => {
    if (running) return;
    const waiting = [...entries.values()].filter((entry) => entry.start);
    const entry = waiting.find((entry) => entry.inUse) ?? waiting[0];
    if (!entry) return;
    const start = entry.start!;
    entry.start = undefined;
    running = true;
    void start().finally(() => {
      running = false;
      pump();
    });
  };
  const retained = (index: number) =>
    current >= 0 && Math.abs(index - current) <= 1;
  const release = (index: number) => {
    const entry = entries.get(index);
    if (!entry?.loaded || (!closed && (entry.inUse || retained(index)))) return;
    entries.delete(index);
    originals[index].unload?.();
  };
  const acquire = (index: number, inUse: boolean): Promise<string> => {
    if (closed) return Promise.reject(new Error('Reader is closed'));
    const existing = entries.get(index);
    if (existing) {
      existing.inUse ||= inUse;
      return existing.promise;
    }
    const entry: {
      promise: Promise<string>;
      loaded: boolean;
      inUse: boolean;
      start?: () => Promise<void>;
    } = {
      promise: undefined as unknown as Promise<string>,
      loaded: false,
      inUse,
    };
    entries.set(index, entry);
    entry.promise = new Promise((resolve, reject) => {
      entry.start = async () => {
        try {
          if (closed) throw new Error('Reader is closed');
          if (!entry.inUse && !retained(index))
            throw new Error('Prefetch is no longer needed');
          const src = await originals[index].load();
          entry.loaded = true;
          release(index);
          if (closed) throw new Error('Reader is closed');
          resolve(src);
        } catch (error) {
          entries.delete(index);
          reject(error);
        }
      };
    });
    // The EPUB loader does not coalesce shared image/style loads itself.
    // Serialize sections, choosing foreground requests before queued prefetch.
    queueMicrotask(pump);
    return entry.promise;
  };
  sections.forEach((section, index) => {
    section.load = () => acquire(index, true);
    section.unload = () => {
      const entry = entries.get(index);
      if (entry) entry.inUse = false;
      release(index);
    };
  });
  return {
    relocate(index: number) {
      if (
        closed ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sections.length ||
        index === current
      )
        return;
      current = index;
      entries.forEach((_, index) => release(index));
      // Only publication resources are loaded: no iframe, reader load event,
      // position update, or statistics event is produced by a prefetch.
      for (const i of [index, index + 1, index - 1]) {
        if (i >= 0 && i < sections.length)
          void acquire(i, false).catch(() => {});
      }
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      closed = true;
      const pending = [...entries.values()].map((entry) => entry.promise);
      entries.forEach((_, index) => release(index));
      // Archive loads cannot all be aborted. Wait before destroying the book
      // so a late completion cannot create an orphaned object URL afterward.
      disposal = Promise.allSettled(pending).then(() => {});
      return disposal;
    },
  };
}
