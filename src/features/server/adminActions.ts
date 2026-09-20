export type AdminAction =
  | 'make-admin'
  | 'make-member'
  | 'disable'
  | 'sign-out-devices'
  | 'delete-library'
  | 'delete-upload'
  | 'stop-watch';
export function adminConsequence(
  action: AdminAction,
  target: string,
): {
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
} {
  const actions = {
    'make-admin': {
      title: `Make ${target} an administrator?`,
      description: `Give ${target} access to server administration and sign out their devices. They can sign in again with administration rights.`,
      confirmLabel: 'Make admin',
      danger: false,
    },
    'make-member': {
      title: `Make ${target} a member?`,
      description: `Remove ${target}’s administration rights and sign out their devices. Their books, notes and reading progress remain.`,
      confirmLabel: 'Make member',
      danger: true,
    },
    disable: {
      title: `Disable ${target}?`,
      description: `Prevent ${target} from signing in and sign out all their devices. Their books, notes and reading progress remain.`,
      confirmLabel: 'Disable',
      danger: true,
    },
    'sign-out-devices': {
      title: `Sign out ${target}’s devices?`,
      description: `Sign out all devices for ${target}. They can sign in again with their password.`,
      confirmLabel: 'Sign out devices',
      danger: true,
    },
    'delete-library': {
      title: `Delete ${target}?`,
      description: `Delete this collection, its shared access, uploaded server files and cached snapshots, and stop its folder watches. Watched originals and members’ downloaded books, notes and reading progress stay intact.`,
      confirmLabel: 'Delete library and server files',
      danger: true,
    },
    'delete-upload': {
      title: `Delete the uploaded file for ${target}?`,
      description: `Delete this uploaded server file. Members keep downloaded copies, notes and reading progress. A watched copy, if present, remains available; otherwise the book can no longer be downloaded from this collection. Original source files stay intact.`,
      confirmLabel: 'Delete uploaded file',
      danger: true,
    },
    'stop-watch': {
      title: `Stop watching ${target}?`,
      description: `Stop sharing books from this folder unless they were uploaded separately. Original files and members’ downloaded books, notes and reading progress stay intact.`,
      confirmLabel: 'Stop watching',
      danger: true,
    },
  };
  return actions[action];
}
