import type { ReactNode } from 'react';
/** Deliberately small: embedded HTML, links and unsupported syntax stay text. */
export function ReleaseNotes({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [],
    bullets: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      nodes.push(<p key={nodes.length}>{paragraph.join(' ')}</p>);
      paragraph = [];
    }
    if (bullets.length) {
      nodes.push(
        <ul key={nodes.length}>
          {bullets.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading || /^\[v?\d+\.\d+[^\]]*\](?:\s+-.*)?$/.test(line)) {
      flush();
      const label = (heading?.[2] ?? line).replace(
        /^\[(v?\d+\.\d+[^\]]*)\]/,
        '$1',
      );
      nodes.push(
        heading && heading[1].length >= 3 ? (
          <h5 key={nodes.length}>{label}</h5>
        ) : (
          <h4 key={nodes.length}>{label}</h4>
        ),
      );
    } else if (/^[-*]\s+/.test(line)) {
      if (paragraph.length) flush();
      bullets.push(line.slice(2).trim());
    } else {
      if (bullets.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <div className="release-notes">{nodes}</div>;
}
