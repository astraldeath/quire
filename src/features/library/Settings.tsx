import { FileHandlingSettings } from '../desktop/FileHandlingSettings';
import { StorageSettings } from '../storage/StorageSettings';
import { UpdateSettings } from '../updates/UpdateSettings';
import { Download } from 'lucide-react';
import { PrivacySettings } from '../privacy/PrivacySettings';
import { usePrivacy } from '../privacy/Privacy';
import { Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadSync } from '../../storage';
import {
  Archive,
  Library,
  Palette,
  Cloud,
  ChartNoAxesCombined,
} from 'lucide-react';
import { Statistics } from '../statistics/Statistics';
import { ServerSettings } from '../sync/ServerSettings';
import { BackupSettings, type BackupActions } from '../backup/BackupSettings';
import { defaults, type Book, type Preferences } from '../../domain/models';
import { Modal } from '../../components/Modal';
import { SettingsTabs } from '../../components/SettingsTabs';
import { ThemePicker, ColorControl } from '../../components/Controls';
import { requestNavigation } from '../navigation/blockers';
export function Settings({
  preferences: p,
  books,
  backupActions,
  onChange,
  onClose,
  activeTab,
  onTabChange,
  beforeUpdate,
  onViewOptions,
  onLibrary,
}: {
  onViewOptions(): void;
  onLibrary(): void;
  beforeUpdate?: () => Promise<void>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  books: Book[];
  backupActions: BackupActions;
  preferences: Preferences;
  onChange(p: Preferences): void;
  onClose(): void;
}) {
  const [localTab, setLocalTab] = useState('appearance');
  const changeTab = (id: string) => {
    setLocalTab(id);
    onTabChange?.(id);
  };
  const [working, setWorking] = useState(false);
  const privacy = usePrivacy();
  const [connected, setConnected] = useState(
    import.meta.env.VITE_HOSTED === 'true',
  );
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadSync()
        .then((state) => {
          if (alive) setConnected(!!state.enabled && !!state.account);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('quire-storage', refresh);
    return () => {
      alive = false;
      window.removeEventListener('quire-storage', refresh);
    };
  }, []);
  return (
    <Modal
      title="Settings"
      onClose={() => {
        if (!working) requestNavigation(onClose);
      }}
    >
      <SettingsTabs
        layout="settings"
        active={activeTab ?? localTab}
        onActiveChange={changeTab}
        label="Settings sections"
        disabled={working}
        tabs={[
          {
            id: 'appearance',
            label: 'Appearance',
            icon: Palette,
            content: (
              <div className="settings-body">
                <ThemePicker
                  label="App theme"
                  value={p.theme}
                  options={[
                    'system',
                    'light',
                    'dark',
                    'onyx',
                    'contrast',
                    'custom',
                  ]}
                  onChange={(theme) => onChange({ ...p, theme })}
                />
                {p.theme === 'custom' && (
                  <>
                    <ColorControl
                      label="Background color"
                      value={p.background}
                      onChange={(background) => onChange({ ...p, background })}
                    />
                    <ColorControl
                      label="Text color"
                      value={p.foreground}
                      onChange={(foreground) => onChange({ ...p, foreground })}
                    />
                  </>
                )}
                {p.theme !== 'contrast' && (
                  <ColorControl
                    label="Accent color"
                    value={p.accent}
                    onChange={(accent) => onChange({ ...p, accent })}
                  />
                )}
                <button
                  className="text-action"
                  onClick={() =>
                    onChange({
                      ...p,
                      theme: defaults.theme,
                      accent: defaults.accent,
                      background: defaults.background,
                      foreground: defaults.foreground,
                    })
                  }
                >
                  Reset appearance
                </button>
              </div>
            ),
          },
          {
            id: 'library',
            label: 'Library',
            icon: Library,
            content: (
              <div className="settings-body">
                <button onClick={onViewOptions}>View options</button>
                <button
                  className="text-action"
                  onClick={() =>
                    onChange({
                      ...p,
                      view: defaults.view,
                      coverSize: defaults.coverSize,
                      groupSeries: defaults.groupSeries,
                    })
                  }
                >
                  Reset library settings
                </button>
                <StorageSettings
                  onConnect={() => requestNavigation(() => changeTab('server'))}
                />
                <FileHandlingSettings />
              </div>
            ),
          },
          {
            id: 'backups',
            label: 'Backups',
            icon: Archive,
            content:
              !privacy.unlocked &&
              Object.values(privacy.state.books).some(
                (mode) => mode !== 'normal',
              ) ? (
                <button onClick={() => void privacy.authenticate()}>
                  Unlock to manage backups
                </button>
              ) : (
                <BackupSettings
                  books={books}
                  preferences={p}
                  actions={backupActions}
                  onBusy={setWorking}
                />
              ),
          },
          {
            id: 'privacy',
            label: 'Privacy',
            icon: Shield,
            content: <PrivacySettings connected={connected} />,
          },
          {
            id: 'statistics',
            label: 'Statistics',
            icon: ChartNoAxesCombined,
            content: <Statistics books={books} onLibrary={onLibrary} />,
          },
          {
            id: 'server',
            label: 'Sync',
            icon: Cloud,
            content: <ServerSettings books={books} />,
          },
          {
            id: 'updates',
            label: 'Updates',
            icon: Download,
            content: (
              <UpdateSettings onBusy={setWorking} beforeUpdate={beforeUpdate} />
            ),
          },
        ]}
      />
    </Modal>
  );
}
