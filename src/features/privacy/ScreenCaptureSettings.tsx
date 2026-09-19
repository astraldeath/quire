import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Switch } from '../../components/Controls';
interface CaptureState {
  support: 'windows' | 'macos' | 'linux' | 'unavailable';
  enabled: boolean;
}
export function ScreenCaptureSettings() {
  const [state, setState] = useState<CaptureState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    void invoke<CaptureState>('screen_capture')
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {
        if (live)
          setError(
            'Could not read screen capture settings. Reopen settings to retry.',
          );
      });
    return () => {
      live = false;
    };
  }, []);
  if (!isTauri() || state?.support === 'unavailable') return null;
  const supported = state?.support === 'windows' || state?.support === 'macos';
  const change = async (enabled: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      setState(await invoke<CaptureState>('screen_capture', { enabled }));
    } catch {
      setError('Could not change screen capture protection. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="backup-settings">
      <h3>Screen capture</h3>
      {supported && (
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <Switch
            label={
              state.support === 'macos'
                ? 'Reduce screen capture (limited)'
                : 'Block screen capture'
            }
            checked={state.enabled}
            onChange={(value) => void change(value)}
          />
        </fieldset>
      )}
      {state?.support === 'windows' && (
        <p className="muted">
          Exclude Quire from supported screenshots and screen sharing. Some
          capture tools can bypass this.
        </p>
      )}
      {state?.support === 'macos' && (
        <p className="muted">
          Some capture tools may still capture Quire, especially on recent macOS
          versions.
        </p>
      )}
      {state?.support === 'linux' && (
        <p className="muted">
          Capture blocking is not available on Linux. Use Cover when inactive to
          hide Quire when switching windows.
        </p>
      )}
      {!state && !error && (
        <p className="muted" role="status">
          Checking availability…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
