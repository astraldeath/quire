import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';
import { ScanFace, LockKeyhole } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Wordmark } from '../../components/Wordmark';
import { devicePrivacyKey } from '../../storage';
import { privacyChanged, privacyReceived } from './sync';
import { samePrivacy } from './shared';
import {
  canAccess,
  credential,
  emptyPrivacy,
  readPrivacy,
  verifyPasscode,
  type BookPrivacy,
  type PrivacyState,
} from './model';

interface Privacy {
  state: PrivacyState;
  current(): PrivacyState;
  unlocked: boolean;
  access(id: string): boolean;
  authenticate(force?: boolean): Promise<boolean>;
  update(
    patch:
      | Partial<PrivacyState>
      | ((current: PrivacyState) => Partial<PrivacyState>),
  ): void;
  protect(ids: string[], mode: BookPrivacy): Promise<boolean>;
  lock(): void;
}
const Context = createContext<Privacy | null>(null);
export function usePrivacy() {
  return useContext(Context)!;
}
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const key = devicePrivacyKey();
  const [initial] = useState(() => {
    try {
      return { state: readPrivacy(key), error: '' };
    } catch (e) {
      return { state: emptyPrivacy(), error: String(e) };
    }
  });
  const [state, setState] = useState(initial.state);
  const stateRef = useRef(state);
  const [unlocked, setUnlocked] = useState(false);
  const unlockedRef = useRef(false);
  const [prompt, setPrompt] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [covered, setCovered] = useState(false);
  const pending = useRef<((value: boolean) => void)[]>([]);
  const epoch = useRef(0);
  const nativeLifecycle = useRef(false);
  function finish(ok: boolean) {
    if (!ok) epoch.current++;
    if (ok) {
      unlockedRef.current = true;
      setUnlocked(true);
    }
    setPrompt(false);
    setPasscode('');
    setConfirm('');
    setError('');
    pending.current.splice(0).forEach((resolve) => resolve(ok));
  }
  function lock() {
    epoch.current++;
    unlockedRef.current = false;
    setUnlocked(false);
    finish(false);
  }
  function update(
    change:
      | Partial<PrivacyState>
      | ((current: PrivacyState) => Partial<PrivacyState>),
  ) {
    const current = readPrivacy(key);
    const patch = typeof change === 'function' ? change(current) : change;
    if (
      'credential' in patch &&
      current.credential &&
      !samePrivacy(current.credential, patch.credential) &&
      !unlockedRef.current
    )
      throw new Error('Unlock private books before changing the passcode.');
    const next = { ...current, ...patch };
    localStorage.setItem(key, JSON.stringify(next));
    stateRef.current = next;
    setState(next);
    if ('credential' in patch || 'books' in patch)
      window.dispatchEvent(new Event(privacyChanged));
    if (isTauri())
      void invoke('plugin:privacy|configure', { shield: next.shield }).catch(
        () => {},
      );
  }
  function authenticate(force = false): Promise<boolean> {
    if (!force && unlockedRef.current) return Promise.resolve(true);
    setPrompt(true);
    return new Promise((resolve) => pending.current.push(resolve));
  }
  async function submit(biometric = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    const started = epoch.current;
    try {
      const current = stateRef.current;
      if (Date.now() < current.retryAt)
        throw new Error('Too many attempts. Try again in a minute.');
      if (!current.credential) {
        if (passcode !== confirm) throw new Error('Passcodes do not match.');
        const value = await credential(passcode);
        if (started !== epoch.current) return;
        update({ credential: value });
      } else {
        const valid = biometric
          ? await invoke<boolean>('plugin:privacy|authenticate')
          : await verifyPasscode(passcode, current.credential);
        if (started !== epoch.current) return;
        if (!valid) {
          const failures = current.failures + 1;
          update({ failures, retryAt: failures >= 5 ? Date.now() + 60000 : 0 });
          throw new Error(
            biometric
              ? 'Biometric authentication was not completed. Try your passcode.'
              : 'Incorrect passcode.',
          );
        }
        update({ failures: 0, retryAt: 0 });
      }
      finish(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Authentication was cancelled.',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const received = (event: Event) => {
      flushSync(() => {
        const next = readPrivacy(key);
        if ((event as CustomEvent<{ changed: boolean }>).detail.changed) lock();
        stateRef.current = next;
        setState(next);
      });
    };
    const background = () =>
      flushSync(() => {
        // The native overlay already covers iOS, including WebView dialogs.
        // A second showModal() here steals focus and moves the keyboard on resume.
        setCovered(!nativeLifecycle.current && stateRef.current.shield);
        if (stateRef.current.autoLock) lock();
      });
    const foreground = () => flushSync(() => setCovered(false));
    const visibility = () => {
      // Face ID and other system UI can hide the WebView without backgrounding
      // the app. Only the native background notification should lock on iOS.
      if (nativeLifecycle.current) return;
      const hidden = document.visibilityState === 'hidden';
      setCovered(hidden && stateRef.current.shield);
      if (hidden && stateRef.current.autoLock) lock();
    };
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      lock();
      // Reload also clears any in-flight reader/actions from another tab.
      location.reload();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('storage', changed);
    window.addEventListener(privacyReceived, received);
    window.addEventListener('quire-background', background);
    window.addEventListener('quire-foreground', foreground);
    if (isTauri())
      void invoke('plugin:privacy|configure', {
        shield: stateRef.current.shield,
      })
        .then(() => {
          nativeLifecycle.current = true;
        })
        .catch(() => {});
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('storage', changed);
      window.removeEventListener(privacyReceived, received);
      window.removeEventListener('quire-background', background);
      window.removeEventListener('quire-foreground', foreground);
      pending.current.splice(0).forEach((resolve) => resolve(false));
    };
  }, [key]);
  if (initial.error)
    return (
      <main className="hosted-entry">
        <p role="alert">{initial.error}</p>
      </main>
    );
  return (
    <Context.Provider
      value={{
        state,
        current: () => readPrivacy(key),
        unlocked,
        access: (id) => canAccess(stateRef.current, id, unlockedRef.current),
        authenticate,
        update,
        lock,
        protect: async (ids, mode) => {
          if (!(await authenticate(true)) || !unlockedRef.current) return false;
          const books = { ...stateRef.current.books };
          ids.forEach((id) => {
            if (mode === 'normal') delete books[id];
            else books[id] = mode;
          });
          update({ books });
          return true;
        },
      }}
    >
      <div style={{ display: 'contents' }} inert={covered || prompt}>
        {children}
      </div>
      {prompt && (
        <Modal
          title={state.credential ? 'Unlock private books' : 'Create passcode'}
          onClose={() => finish(false)}
        >
          <form
            className="privacy-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label>
              Passcode
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                minLength={6}
                maxLength={12}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </label>
            {!state.credential && (
              <label>
                Confirm passcode
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            {!state.credential && (
              <p className="muted">
                Use 6–12 digits. This passcode cannot be recovered.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              <LockKeyhole size={18} />
              {busy
                ? 'Checking…'
                : state.credential
                  ? 'Unlock'
                  : 'Create passcode'}
            </button>
            {state.credential && state.biometrics && isTauri() && (
              <button
                type="button"
                className="privacy-biometric"
                disabled={busy}
                onClick={() => void submit(true)}
              >
                <ScanFace size={18} />
                Use biometrics
              </button>
            )}
          </form>
        </Modal>
      )}
      {covered && (
        <dialog
          className="privacy-cover"
          aria-label="Quire privacy screen"
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={(event) => event.preventDefault()}
        >
          <Wordmark />
        </dialog>
      )}
    </Context.Provider>
  );
}
