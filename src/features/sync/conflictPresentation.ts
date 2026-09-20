import { validFolders } from '../library/folders';
import type { Candidate, Kind } from './model';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function titleCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function conflictFields(
  kind: Kind,
  candidate: Candidate,
): { label: string; value: string }[] {
  if (candidate.deleted || !candidate.value) return [];
  const value = candidate.value;
  if (kind === 'position') {
    const fraction = value.fraction;
    return [
      ...(text(value.section)
        ? [{ label: 'Chapter', value: text(value.section) }]
        : []),
      {
        label: 'Progress',
        value:
          typeof fraction === 'number' &&
          Number.isFinite(fraction) &&
          fraction >= 0 &&
          fraction <= 1
            ? `${Math.round(fraction * 1000) / 10}%`
            : 'Progress unavailable',
      },
    ];
  }
  if (kind === 'annotation')
    return [
      ...(text(value.kind)
        ? [{ label: 'Type', value: titleCase(text(value.kind)) }]
        : []),
      ...(text(value.section)
        ? [{ label: 'Chapter', value: text(value.section) }]
        : []),
      ...(text(value.text)
        ? [{ label: 'Passage', value: text(value.text) }]
        : []),
      ...(text(value.note) ? [{ label: 'Note', value: text(value.note) }] : []),
    ];

  const folders = validFolders(value.folders)
    ? value.folders
    : typeof value.folder === 'string'
      ? value.folder
        ? [value.folder]
        : []
      : undefined;
  return [
    ...(text(value.title)
      ? [{ label: 'Title', value: text(value.title) }]
      : []),
    ...(text(value.author)
      ? [{ label: 'Author', value: text(value.author) }]
      : []),
    ...(text(value.series)
      ? [{ label: 'Series', value: text(value.series) }]
      : []),
    ...(typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? [{ label: 'Volume', value: String(value.volume) }]
      : []),
    ...(text(value.format)
      ? [{ label: 'Format', value: text(value.format).toUpperCase() }]
      : []),
    ...(folders
      ? [
          {
            label: 'Folders',
            value: folders.length ? folders.join(', ') : 'No folders',
          },
        ]
      : []),
  ];
}
