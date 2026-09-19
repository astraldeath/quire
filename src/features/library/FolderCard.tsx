import { Folder, BookOpen } from 'lucide-react';
import type { Book } from '../../domain/models';

export function FolderCard({
  path,
  books,
  href,
  onOpen,
}: {
  path: string;
  books: Book[];
  href?: string;
  onOpen(): void;
}) {
  const name = path.split('/').at(-1)!;
  const covers = books.filter((book) => book.cover).slice(0, 4);
  const contents = (
    <>
      <div className="cover-frame folder-cover" aria-hidden="true">
        <div className={`folder-cover-preview preview-${covers.length}`}>
          {covers.length ? (
            covers.map((book) => (
              <img
                key={book.id}
                src={book.cover}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ))
          ) : (
            <BookOpen />
          )}
        </div>
        <span className="folder-cover-badge">
          <Folder />
        </span>
      </div>
      <div className="book-copy">
        <h2 title={name}>{name}</h2>
        <p className="book-author">
          {books.length} {books.length === 1 ? 'book' : 'books'}
        </p>
      </div>
    </>
  );
  return (
    <article className="book folder-card">
      {href ? (
        <a
          className="book-open"
          href={href}
          aria-label={`Open folder ${name}`}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onOpen();
          }}
        >
          {contents}
        </a>
      ) : (
        <button
          className="book-open"
          aria-label={`Open folder ${name}`}
          onClick={onOpen}
        >
          {contents}
        </button>
      )}
    </article>
  );
}
