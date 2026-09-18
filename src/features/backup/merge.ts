import type { Book } from '../../domain/models';
/** Keep local organization; preserve distinct note versions and make repeat imports idempotent. */
export function mergeBook(local: Book | undefined, incoming: Book): Book {
  if (!local) return incoming;
  const annotations = [...(local.annotations ?? [])];
  for (const item of incoming.annotations ?? []) {
    if (
      annotations.some(
        (a) =>
          a.kind === item.kind &&
          a.cfi === item.cfi &&
          a.text === item.text &&
          a.note === item.note,
      )
    )
      continue;
    let id = item.id;
    let suffix = 1;
    while (annotations.some((a) => a.id === id))
      id = `${item.id}-restored-${suffix++}`;
    annotations.push({ ...item, id });
  }
  return {
    ...local,
    ...(local.format === undefined && incoming.format
      ? { format: incoming.format }
      : {}),
    local: local.local || incoming.local,
    position:
      !local.position ||
      (incoming.position &&
        incoming.position.updatedAt > local.position.updatedAt)
        ? incoming.position
        : local.position,
    annotations,
  };
}
