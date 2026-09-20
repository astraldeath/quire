import { useSyncExternalStore } from 'react';
import {
  Archive,
  FolderOpen,
  LayoutDashboard,
  Library,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
export const adminSections = [
  ['overview', 'Overview', LayoutDashboard],
  ['libraries', 'Libraries', Library],
  ['folders', 'Watched folders', FolderOpen],
  ['settings', 'Settings', Settings],
  ['accounts', 'Accounts', Users],
  ['invites', 'Invitations', Ticket],
  ['backups', 'Backups', Archive],
] as const;
export type AdminSection = (typeof adminSections)[number][0];
const query = '(max-width: 600px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia?.(query);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia?.(query).matches ?? false;
export function AdminNavigation({
  active,
  onChange,
}: {
  active: AdminSection;
  onChange(value: AdminSection): void;
}) {
  const phone = useSyncExternalStore(subscribe, snapshot, () => false);
  return phone ? (
    <label className="admin-section-select">
      Administration section
      <select
        value={active}
        onChange={(e) => onChange(e.target.value as AdminSection)}
      >
        {adminSections.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <nav aria-label="Administration">
      {adminSections.map(([id, label, Icon]) => (
        <button
          key={id}
          aria-current={id === active ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}
