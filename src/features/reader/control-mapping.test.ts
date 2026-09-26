import { describe, expect, it } from 'vitest';
import { defaults } from '../../domain/models';
import {
  assignShortcut,
  defaultShortcuts,
  shortcutAction,
  tapAction,
} from './control-mapping';

describe('reading tap zones', () => {
  it('preserves default boundaries and RTL navigation', () => {
    expect(tapAction(10, 100, false, defaults.reader)).toBe('prev');
    expect(tapAction(25, 100, false, defaults.reader)).toBe('controls');
    expect(tapAction(75, 100, false, defaults.reader)).toBe('controls');
    expect(tapAction(90, 100, true, defaults.reader)).toBe('prev');
    expect(tapAction(-1, 100, false, defaults.reader)).toBeNull();
    expect(tapAction(10, 0, false, defaults.reader)).toBeNull();
  });
  it('uses custom regions, disabled actions, and bounded widths', () => {
    const prefs = {
      ...defaults.reader,
      tapZones: {
        left: 'none',
        center: 'next',
        right: 'controls',
        sideWidth: 40,
      },
    } as const;
    expect(tapAction(35, 100, false, prefs)).toBe('none');
    expect(tapAction(50, 100, false, prefs)).toBe('next');
    expect(tapAction(65, 100, true, prefs)).toBe('controls');
    expect(tapAction(50, 100, true, prefs)).toBe('prev');
  });
});

describe('reading shortcuts', () => {
  it('preserves arrows and supports persisted keys and disabling', () => {
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
        defaults.reader,
      ),
    ).toBe('next');
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
        defaults.reader,
        true,
      ),
    ).toBe('prev');
    const prefs = { ...defaults.reader, shortcuts: { next: '', search: 'f' } };
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
        prefs,
      ),
    ).toBeNull();
    expect(
      shortcutAction(new KeyboardEvent('keydown', { key: 'f' }), prefs),
    ).toBe('search');
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }),
        prefs,
      ),
    ).toBeNull();
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'f', shiftKey: true }),
        prefs,
      ),
    ).toBeNull();
    expect(
      shortcutAction(
        new KeyboardEvent('keydown', { key: 'f', isComposing: true }),
        prefs,
      ),
    ).toBeNull();
  });
  it('does not capture keys from editable or interactive elements', () => {
    for (const html of [
      '<input>',
      '<textarea></textarea>',
      '<select></select>',
      '<button>Next</button>',
      '<a href="#">Link</a>',
      '<div contenteditable="true"><span>Text</span></div>',
    ]) {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.append(host);
      let action: unknown = 'unhandled';
      host.addEventListener('keydown', (event) => {
        action = shortcutAction(event, defaults.reader);
      });
      (host.querySelector('span') ?? host.firstElementChild)!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          composed: true,
        }),
      );
      expect(action).toBeNull();
      host.remove();
    }
  });
  it('resolves conflicts by clearing the previous assignment', () => {
    const assigned = assignShortcut(defaultShortcuts, 'search', 'ArrowRight');
    expect(assigned.search).toBe('ArrowRight');
    expect(assigned.next).toBe('');
    expect(defaultShortcuts.next).toBe('ArrowRight');
  });
});
