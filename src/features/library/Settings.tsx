import { StorageSettings } from '../storage/StorageSettings';
import { PrivacySettings } from '../privacy/PrivacySettings';
import { usePrivacy } from '../privacy/Privacy';
import { Shield } from 'lucide-react';
import { useState } from 'react';
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
import {
  ThemePicker,
  StepperControl,
  Switch,
  ColorControl,
} from '../../components/Controls';
export function Settings({
  preferences: p,
  books,
  backupActions,
  onChange,
  onClose,
  activeTab,
  onTabChange,
}: {
  activeTab?: string;
  onTabChange?: (id: string) => void;
  books: Book[];
  backupActions: BackupActions;
  preferences: Preferences;
  onChange(p: Preferences): void;
  onClose(): void;
}) {
  const [working, setWorking] = useState(false);
  const privacy = usePrivacy();
  return (
    <Modal
      title="Settings"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <SettingsTabs
        active={activeTab}
        onActiveChange={onTabChange}
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
                <StepperControl
                  label="Cover size"
                  min={110}
                  max={210}
                  step={10}
                  value={p.coverSize}
                  unit=" px"
                  onChange={(coverSize) => onChange({ ...p, coverSize })}
                />
                <Switch
                  label="Group books into series"
                  checked={p.groupSeries}
                  onChange={(groupSeries) => onChange({ ...p, groupSeries })}
                />
                <button
                  className="text-action"
                  onClick={() =>
                    onChange({
                      ...p,
                      coverSize: defaults.coverSize,
                      groupSeries: defaults.groupSeries,
                    })
                  }
                >
                  Reset library settings
                </button>
                <StorageSettings />
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
            content: <PrivacySettings />,
          },
          {
            id: 'statistics',
            label: 'Statistics',
            icon: ChartNoAxesCombined,
            content: <Statistics books={books} />,
          },
          ...(import.meta.env.VITE_HOSTED === 'true'
            ? []
            : [
                {
                  id: 'server',
                  label: 'Server',
                  icon: Cloud,
                  content: <ServerSettings />,
                },
              ]),
        ]}
      />
    </Modal>
  );
}
