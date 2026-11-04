import { useState } from 'react';
import { Check, ChevronDown, Library, EyeOff, LibraryBig } from 'lucide-react';
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
  collections = [],
  collection = 'all',
  onCollection,
}: {
  hidden: boolean;
  shared?: boolean;
  hasShared?: boolean;
  onShared?(): void;
  onLibrary(): void;
  onHidden(): void;
  collections?: { id: string; name: string }[];
  collection?: string;
  onCollection?(id: string): void;
}) {
  const [anchor, setAnchor] = useState<ActionAnchor>();
  const label = hidden
    ? 'Hidden books'
    : shared
      ? (collections.find((item) => item.id === collection)?.name ??
        'Shared libraries')
      : 'All books';
  return (
    <>
      <button
        className="library-destination"
        aria-label={`Current library: ${label}`}
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
        {label}
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
              aria-current={!hidden && !shared ? 'true' : undefined}
              onClick={() => {
                setAnchor(undefined);
                onLibrary();
              }}
            >
              <Library />
              All books
              {!hidden && !shared && (
                <Check className="destination-check" aria-hidden="true" />
              )}
            </ActionMenuItem>
            <ActionMenuItem
              menuId="hidden"
              aria-current={hidden ? 'true' : undefined}
              onClick={() => {
                setAnchor(undefined);
                onHidden();
              }}
            >
              <EyeOff />
              Hidden books
              {hidden && (
                <Check className="destination-check" aria-hidden="true" />
              )}
            </ActionMenuItem>
            {hasShared && (
              <ActionMenuItem
                menuId="shared"
                aria-current={
                  !hidden && shared && collection === 'shared'
                    ? 'true'
                    : undefined
                }
                onClick={() => {
                  setAnchor(undefined);
                  onShared?.();
                }}
              >
                <LibraryBig />
                Shared libraries
                {!hidden && shared && collection === 'shared' && (
                  <Check className="destination-check" aria-hidden="true" />
                )}
              </ActionMenuItem>
            )}
            {collections.map((item) => (
              <ActionMenuItem
                key={item.id}
                menuId={`collection-${item.id}`}
                aria-current={
                  !hidden && collection === item.id ? 'true' : undefined
                }
                onClick={() => {
                  setAnchor(undefined);
                  onCollection?.(item.id);
                }}
              >
                <LibraryBig />
                <span className="destination-name">{item.name}</span>
                {!hidden && collection === item.id && (
                  <Check className="destination-check" aria-hidden="true" />
                )}
              </ActionMenuItem>
            ))}
          </div>
        </ActionPopover>
      )}
    </>
  );
}
