import { useState } from 'react';
import { ChevronDown, Library, EyeOff, LibraryBig } from 'lucide-react';
import {
  ActionPopover,
  type ActionAnchor,
} from '../../components/ActionPopover';
import { ActionMenuItem } from '../../components/ActionMenuItem';
export function LibraryDestination({
  hidden,
  shared = false,
  hasShared = false,
  onShared,
  onLibrary,
  onHidden,
}: {
  hidden: boolean;
  shared?: boolean;
  hasShared?: boolean;
  onShared?(): void;
  onLibrary(): void;
  onHidden(): void;
}) {
  const [anchor, setAnchor] = useState<ActionAnchor>();
  return (
    <>
      <button
        className="library-destination"
        aria-label={`Current library: ${hidden ? 'Hidden books' : shared ? 'Shared libraries' : 'All books'}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor({
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
            element: e.currentTarget,
          });
        }}
      >
        {hidden ? 'Hidden books' : shared ? 'Shared libraries' : 'All books'}
        <ChevronDown aria-hidden="true" />
      </button>
      {anchor && (
        <ActionPopover
          title="Library"
          anchor={anchor}
          onClose={() => setAnchor(undefined)}
        >
          <div className="book-action-list">
            <ActionMenuItem
              menuId="library"
              onClick={() => {
                setAnchor(undefined);
                onLibrary();
              }}
            >
              <Library />
              All books
            </ActionMenuItem>
            <ActionMenuItem
              menuId="hidden"
              onClick={() => {
                setAnchor(undefined);
                onHidden();
              }}
            >
              <EyeOff />
              Hidden books
            </ActionMenuItem>
            {hasShared && (
              <ActionMenuItem
                menuId="shared"
                onClick={() => {
                  setAnchor(undefined);
                  onShared?.();
                }}
              >
                <LibraryBig />
                Shared libraries
              </ActionMenuItem>
            )}
          </div>
        </ActionPopover>
      )}
    </>
  );
}
