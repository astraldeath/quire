import { expect, it } from 'vitest';
import { formatBytes } from '../src/features/storage/formatBytes';
it.each([
  [0, '0 B'],
  [1, '1 B'],
  [500, '500 B'],
  [2048, '2 KiB'],
  [3 * 1048576, '3 MiB'],
  [2.5 * 1073741824, '2.5 GiB'],
])('formats %s bytes without hiding usage', (bytes, expected) =>
  expect(formatBytes(Number(bytes))).toBe(expected),
);
