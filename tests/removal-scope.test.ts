import { expect, it } from 'vitest';
import { removalDescription } from '../src/features/library/removal';

it.each([1, 3])(
  'describes device-only deletion and retained data when disconnected (%i)',
  (count) => {
    const description = removalDescription(false, count);
    expect(description).toContain(count === 1 ? 'this book' : 'all 3 books');
    expect(description).toMatch(/on this device/);
    expect(description).toMatch(/progress, bookmarks, highlights, and notes/);
    expect(description).toMatch(
      /Original book files, exported backups, and lifetime reading history are kept/,
    );
    expect(description).not.toMatch(/syncs|other devices/);
  },
);
it.each([1, 3])(
  'discloses synced removal without claiming other-device downloads are deleted (%i)',
  (count) => {
    const description = removalDescription(true, count);
    expect(description).toContain(count === 1 ? 'this book' : 'all 3 books');
    expect(description).toMatch(/server and other devices/);
    expect(description).toMatch(/Downloads already on other devices are kept/);
    expect(description).toMatch(
      /Original book files, exported backups, and lifetime reading history are kept/,
    );
  },
);
