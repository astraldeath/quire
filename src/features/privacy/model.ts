import { validatePrivacy, type PrivacySyncState } from './shared';
export type BookPrivacy = 'normal' | 'locked' | 'hidden';
export interface Credential {
  salt: string;
  hash: string;
}
export interface PrivacyState {
  version: 1;
  credential?: Credential;
  books: Record<string, BookPrivacy>;
  biometrics: boolean;
  autoLock: boolean;
  shield: boolean;
  coverOnBlur: boolean;
  failures: number;
  retryAt: number;
  sync?: PrivacySyncState;
}
export const emptyPrivacy = (): PrivacyState => ({
  version: 1,
  books: {},
  biometrics: false,
  autoLock: true,
  shield: false,
  coverOnBlur: false,
  failures: 0,
  retryAt: 0,
});
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
async function hash(passcode: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode(salt),
          iterations: 600000,
          hash: 'SHA-256',
        },
        key,
        256,
      ),
    ),
  );
}
export async function credential(passcode: string): Promise<Credential> {
  if (!/^\d{6,12}$/.test(passcode)) throw new Error('Use 6–12 digits.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hash(passcode, salt) };
}
export async function verifyPasscode(passcode: string, value: Credential) {
  return (await hash(passcode, value.salt)) === value.hash;
}
export const canAccess = (state: PrivacyState, id: string, unlocked: boolean) =>
  unlocked || !state.books[id] || state.books[id] === 'normal';
export const visibleBook = (
  state: PrivacyState,
  id: string,
  hiddenView: boolean,
  unlocked: boolean,
) =>
  hiddenView
    ? unlocked && state.books[id] === 'hidden'
    : state.books[id] !== 'hidden';
export function readPrivacy(key: string): PrivacyState {
  const raw = localStorage.getItem(key);
  if (!raw) return emptyPrivacy();
  const data = JSON.parse(raw) as PrivacyState;
  if (
    data.version !== 1 ||
    !data.books ||
    typeof data.books !== 'object' ||
    Object.values(data.books).some(
      (v) => !['normal', 'locked', 'hidden'].includes(v),
    ) ||
    (data.credential &&
      (!/^[a-f0-9]{32}$/.test(data.credential.salt) ||
        !/^[a-f0-9]{64}$/.test(data.credential.hash))) ||
    (!data.credential && Object.values(data.books).some((v) => v !== 'normal'))
  )
    throw new Error(
      'Privacy settings could not be read. Restore this device’s app data before continuing.',
    );
  if (data.sync) {
    if (
      typeof data.sync.account !== 'string' ||
      !Number.isSafeInteger(data.sync.revision) ||
      data.sync.revision < 0
    )
      throw new Error('Invalid private library sync state.');
    validatePrivacy(data.sync.baseline);
  }
  return { ...emptyPrivacy(), ...data };
}
