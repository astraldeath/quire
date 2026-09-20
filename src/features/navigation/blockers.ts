type Blocker = (resume: () => void) => void;
const blockers = new Set<Blocker>();
const bypassed = new Set<Blocker>();

export function registerNavigationBlocker(requestLeave: Blocker): () => void {
  blockers.add(requestLeave);
  return () => {
    blockers.delete(requestLeave);
  };
}
export function hasNavigationBlockers(): boolean {
  return [...blockers].some((blocker) => !bypassed.has(blocker));
}
// Authorization is scoped to this callback's synchronous transition, never the
// next unrelated navigation. Also used for a dialog's direct dismissal callback.
export function resumeDraftTransition(
  blocker: Blocker,
  action: () => void,
): void {
  const alreadyBypassed = bypassed.has(blocker);
  bypassed.add(blocker);
  try {
    action();
  } finally {
    if (!alreadyBypassed) bypassed.delete(blocker);
  }
}
export function requestNavigation(action: () => void): void {
  const candidates = [...blockers]
    .reverse()
    .filter((candidate) => !bypassed.has(candidate));
  const perform = (index: number): void => {
    if (index === candidates.length) {
      action();
      return;
    }
    resumeDraftTransition(candidates[index], () => perform(index + 1));
  };
  const ask = (index: number): void => {
    if (index === candidates.length) {
      perform(0);
      return;
    }
    const blocker = candidates[index];
    if (!blockers.has(blocker)) {
      ask(index + 1);
      return;
    }
    let resumed = false;
    blocker(() => {
      if (resumed) return;
      resumed = true;
      ask(index + 1);
    });
  };
  ask(0);
}
