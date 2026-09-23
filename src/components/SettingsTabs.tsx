import { requestNavigation } from '../features/navigation/blockers';
import {
  useId,
  useRef,
  useState,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}
const mobileQuery = '(max-width: 600px)';
const subscribeViewport = (notify: () => void) => {
  const media = window.matchMedia?.(mobileQuery);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
};
const mobileSnapshot = () => window.matchMedia?.(mobileQuery).matches ?? false;
export function SettingsTabs({
  tabs,
  label,
  disabled = false,
  active: controlled,
  onActiveChange,
  layout = 'tabs',
  keepMounted = false,
}: {
  layout?: 'tabs' | 'settings';
  /** Keep drafts and one-time values when switching between sections. */
  keepMounted?: boolean;
  tabs: Tab[];
  label: string;
  disabled?: boolean;
  active?: string;
  onActiveChange?: (id: string) => void;
}) {
  const mobile = useSyncExternalStore(
    subscribeViewport,
    mobileSnapshot,
    () => false,
  );
  const vertical = layout === 'settings' && !mobile;
  const [localActive, setLocalActive] = useState(tabs[0].id);
  const active = controlled ?? localActive;
  const setActive = (id: string) => {
    if (disabled || id === active) return;
    const change = () => {
      setLocalActive(id);
      onActiveChange?.(id);
    };
    if (layout === 'settings' && !keepMounted) requestNavigation(change);
    else change();
  };
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (panels.current) panels.current.scrollTop = 0;
    const selected = buttons.current.find(
      (button) => button?.getAttribute('aria-selected') === 'true',
    );
    const reveal = () =>
      selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    reveal();
    if (typeof ResizeObserver !== 'undefined' && selected?.parentElement) {
      const observer = new ResizeObserver(reveal);
      observer.observe(selected.parentElement);
      return () => observer.disconnect();
    }
  }, [active]);
  return (
    <div
      className={`settings-tabs${layout === 'settings' ? ' settings-layout' : ''}`}
    >
      <div
        className="settings-tablist"
        role="tablist"
        aria-label={label}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${tab.id}-tab`}
            aria-label={tab.label}
            title={tab.label}
            aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            disabled={disabled}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => {
              const next =
                e.key === (vertical ? 'ArrowDown' : 'ArrowRight')
                  ? (index + 1) % tabs.length
                  : e.key === (vertical ? 'ArrowUp' : 'ArrowLeft')
                    ? (index + tabs.length - 1) % tabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                e.preventDefault();
                e.stopPropagation();
                setActive(tabs[next].id);
                buttons.current[next]?.focus();
              }
            }}
          >
            <tab.icon aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div ref={panels} className="settings-panels">
        {tabs
          .filter(
            (tab) => keepMounted || layout !== 'settings' || tab.id === active,
          )
          .map((tab) => (
            <section
              key={tab.id}
              id={`${id}-${tab.id}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-${tab.id}-tab`}
              hidden={active !== tab.id}
              tabIndex={0}
            >
              {tab.content}
            </section>
          ))}
      </div>
    </div>
  );
}
