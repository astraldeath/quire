import { invoke, isTauri } from '@tauri-apps/api/core';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

export function FileHandlingSettings() {
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (import.meta.env.VITE_HOSTED === 'true' || !isTauri()) return;
    let alive = true;
    void invoke<string>('desktop_file_platform')
      .then((value) => {
        if (alive) setPlatform(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!['windows', 'macos', 'linux'].includes(platform)) return null;
  return (
    <section className="storage-settings" aria-label="File handling">
      <h3>Open books with Quire</h3>
      <p className="muted">EPUB, CBZ, FB2, FBZ, MOBI, AZW3 and PDF.</p>
      {platform === 'windows' ? (
        <>
          <p className="muted">
            Choose Quire for the file types you want in Windows Default apps.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void invoke('desktop_default_apps')
                .catch(() =>
                  setError(
                    'Open Windows Settings → Apps → Default apps and search for Quire.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <ExternalLink size={16} />
            Open Default apps
          </button>
        </>
      ) : (
        <p className="muted">
          {platform === 'macos'
            ? 'In Finder, select a book, choose Get Info → Open with → Quire, then Change All to use it for that file type.'
            : 'In your file manager, right-click a book, choose Open With, and select Quire. Use the file manager’s default-app option to remember your choice.'}
        </p>
      )}
      {error && (
        <p className="muted" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
