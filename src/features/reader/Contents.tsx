import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TocItem } from 'foliate-js/epub.js';

function currentPath(items: TocItem[], active: string, prefix = ''): string {
  if (!active) return '';
  let match = '';
  items.forEach((item, index) => {
    const path = prefix + index;
    const child = currentPath(item.subitems ?? [], active, path + '.');
    const candidate = child || (item.href === active ? path : '');
    if (
      candidate &&
      (!match || candidate.split('.').length > match.split('.').length)
    )
      match = candidate;
  });
  return match;
}
function branch(path: string) {
  return path
    ? path
        .split('.')
        .map((_, index, parts) => parts.slice(0, index + 1).join('.'))
    : [];
}
export function Contents({
  items,
  go,
  active,
}: {
  items: TocItem[];
  active: string;
  go(href: string): void;
}) {
  const activePath = useMemo(() => currentPath(items, active), [items, active]);
  const [expanded, setExpanded] = useState(() => new Set(branch(activePath)));
  const root = useRef<HTMLOListElement>(null);
  const id = useId();
  useEffect(() => {
    setExpanded((previous) => new Set([...previous, ...branch(activePath)]));
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector('[aria-current="location"]')
        ?.scrollIntoView?.({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [activePath]);
  function toggle(path: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  function rows(nodes: TocItem[], prefix = ''): React.ReactNode {
    return nodes.map((item, index) => {
      const path = prefix + index,
        label = item.label || 'Untitled section';
      const group = !!item.subitems?.length,
        open = expanded.has(path);
      const controls = `${id}-${path}`;
      return (
        <li key={path}>
          <div className="contents-row">
            {group ? (
              <button
                className="contents-toggle"
                aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
                aria-expanded={open}
                aria-controls={controls}
                onClick={() => toggle(path)}
              >
                {open ? (
                  <ChevronDown aria-hidden="true" />
                ) : (
                  <ChevronRight aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="contents-toggle-space" />
            )}
            {item.href || group ? (
              <button
                className="contents-title"
                aria-current={activePath === path ? 'location' : undefined}
                aria-expanded={!item.href && group ? open : undefined}
                aria-controls={!item.href && group ? controls : undefined}
                onClick={() => (item.href ? go(item.href) : toggle(path))}
              >
                {label}
              </button>
            ) : (
              <span className="contents-title">{label}</span>
            )}
          </div>
          {group && (
            <ol id={controls} hidden={!open}>
              {open ? rows(item.subitems!, path + '.') : null}
            </ol>
          )}
        </li>
      );
    });
  }
  return <ol ref={root}>{rows(items)}</ol>;
}
