import { TaskError } from '../../components/TaskError';
import { useEffect, useRef, useState } from 'react';
import { Download, Upload, LoaderCircle } from 'lucide-react';
import type { Book, Preferences } from '../../domain/models';
import { Segments, Switch } from '../../components/Controls';
import { readBackup, type Backup } from './archive';
import { backupNeedsSaveGesture, exportBackup } from './export';
export interface BackupActions {
  prepare(kind: Backup['kind']): Promise<Uint8Array | Blob>;
  restore(backup: Backup, settings: boolean): Promise<void>;
  exported(): Promise<void>;
}
export function BackupSettings({
  books,
  preferences,
  actions,
  onBusy,
}: {
  books: Book[];
  preferences: Preferences;
  actions: BackupActions;
  onBusy(value: boolean): void;
}) {
  const [kind, setKind] = useState<Backup['kind']>('full');
  const [prepared, setPrepared] = useState<Uint8Array | Blob | null>(null);
  const [preview, setPreview] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState('');
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const restoreExportFocus = useRef(false);
  useEffect(() => {
    if (!busy && restoreExportFocus.current) {
      restoreExportFocus.current = false;
      if (
        document.activeElement === document.body &&
        exportButton.current?.isConnected
      )
        exportButton.current.focus({ preventScroll: true });
    }
  }, [busy]);
  const run = async (label: string, work: () => Promise<void>) => {
    restoreExportFocus.current =
      document.activeElement === exportButton.current;
    setBusy(label);
    onBusy(true);
    setMessage('');
    setError('');
    try {
      await work();
    } catch (e) {
      setError(
        label === 'Saving backup' || label === 'Preparing backup'
          ? 'Could not export the backup. Check device storage and try again.'
          : e instanceof Error
            ? e.message
            : 'Could not restore the backup. Choose a valid Quire backup and try again.',
      );
    } finally {
      setBusy('');
      onBusy(false);
    }
  };
  const matched =
    preview?.records.filter((r) => books.some((b) => b.id === r.book.id))
      .length ?? 0;
  return (
    <section className="backup-settings" aria-label="Backup and restore">
      <fieldset disabled={!!busy} className="backup-controls">
        {!preview && (
          <>
            <div className="backup-export">
              <div className="backup-section-heading">
                <h3>Export library</h3>
                <p className="muted">
                  {preferences.lastBackupAt
                    ? `Last saved ${new Date(preferences.lastBackupAt).toLocaleString()}`
                    : 'No backups saved yet'}
                </p>
              </div>
              <Segments
                label="Backup contents"
                value={kind}
                options={[
                  { value: 'full', label: 'Downloaded books + data' },
                  { value: 'data', label: 'Data only' },
                ]}
                onChange={(v) => {
                  setKind(v);
                  setPrepared(null);
                  setMessage('');
                }}
              />
              <p className="muted">
                {kind === 'full'
                  ? `${books.filter((book) => book.local).length} included; ${books.filter((book) => !book.local).length} not downloaded. Reading data for all books and settings are included.`
                  : 'Progress, reading history, notes, highlights, covers, and settings. Book files are not included.'}
              </p>
              <p className="muted">
                Backups are not encrypted. Store them securely.
              </p>
              {prepared ? (
                <div className="backup-ready">
                  <p>
                    Ready to save{' '}
                    <span className="muted">
                      {(
                        (prepared instanceof Uint8Array
                          ? prepared.length
                          : prepared.size) /
                        1024 /
                        1024
                      ).toFixed(1)}{' '}
                      MB
                    </span>
                  </p>
                  <button
                    ref={exportButton}
                    className="primary backup-main-action"
                    onClick={() =>
                      void run('Saving backup', async () => {
                        if (await exportBackup(prepared)) {
                          await actions.exported();
                          setMessage('Backup exported.');
                          setPrepared(null);
                        }
                      })
                    }
                  >
                    <Download />
                    Save prepared backup
                  </button>
                </div>
              ) : (
                <button
                  ref={exportButton}
                  className="primary backup-main-action"
                  onClick={() =>
                    void run('Preparing backup', async () => {
                      const bytes = await actions.prepare(kind);
                      if (backupNeedsSaveGesture()) {
                        setPrepared(bytes);
                        return;
                      }
                      if (await exportBackup(bytes)) {
                        await actions.exported();
                        setMessage('Backup exported.');
                      }
                    })
                  }
                >
                  {busy === 'Preparing backup' ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Download />
                  )}
                  {busy === 'Preparing backup' ? 'Preparing…' : 'Create backup'}
                </button>
              )}
            </div>
            <div className="backup-restore">
              <h3>Restore from a file</h3>
              <button
                className="backup-secondary"
                onClick={() => input.current?.click()}
              >
                <Upload />
                Choose backup file
              </button>
            </div>
          </>
        )}
        <input
          className="file-input"
          ref={input}
          type="file"
          accept=".quire-backup,.zip,application/zip,application/octet-stream"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file)
              void run('Checking backup', async () => {
                setPreview(null);
                setPrepared(null);
                setSettings(false);
                const backup = await readBackup(file);
                setFileName(file.name);
                setPreview(backup);
              });
          }}
        />
        {preview && (
          <div className="backup-preview">
            <div className="backup-section-heading">
              <h3>Review backup</h3>
              <p className="backup-filename">{fileName}</p>
              <p className="muted">
                {new Date(preview.createdAt).toLocaleString()}
              </p>
            </div>
            <ul>
              <li>
                {preview.records.length - matched} new books; {matched} matching
                books
              </li>
              <li>
                {preview.records.filter((r) => r.file).length} book files
                included
              </li>
              <li>
                {preview.records.reduce(
                  (n, r) => n + (r.book.annotations?.length ?? 0),
                  0,
                )}{' '}
                saved bookmarks, highlights, and notes
              </li>
            </ul>
            <p>
              Existing books stay in your library. Newer progress is kept, and
              conflicting notes are preserved as separate entries.
            </p>
            <Switch
              label="Restore settings too"
              checked={settings}
              onChange={setSettings}
            />
            <div className="backup-actions">
              <button
                className="primary"
                onClick={() =>
                  void run('Restoring library', async () => {
                    await actions.restore(preview, settings);
                    setPreview(null);
                    setMessage('Backup restored.');
                  })
                }
              >
                Restore backup
              </button>
              <button onClick={() => setPreview(null)}>Cancel</button>
            </div>
          </div>
        )}
      </fieldset>
      {busy && (
        <p role="status">
          <LoaderCircle className="spin" /> {busy}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <TaskError summary={error} detail="" />}
    </section>
  );
}
