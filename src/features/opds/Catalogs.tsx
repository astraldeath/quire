import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Download,
  Globe,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { hostedWeb, navigateWeb, useWebPath } from '../navigation/routes';
import {
  catalogSearchUrl,
  parseCatalog,
  type CatalogFeed,
  type CatalogPublication,
} from './parser';
import {
  acquisitionFormat,
  downloadCatalogBook,
  fetchCatalog,
  fetchCatalogBlob,
} from './transport';
import {
  catalogContext,
  catalogImported,
  deleteCatalogSource,
  listCatalogSources,
  resolveCatalogSource,
  syncCatalogSources,
  type CatalogContext,
  type CatalogSource,
  type SavedCatalogSource,
} from './sources';
import { SourceDialog } from './SourceDialog';
import './opds.css';
type Destination = { sourceId: string; url: string; title: string };
function Cover({
  ctx,
  source,
  publication,
}: {
  ctx: CatalogContext;
  source: CatalogSource;
  publication: CatalogPublication;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [url, setUrl] = useState('');
  const cover = publication.covers[0]?.url;
  useEffect(() => {
    if (!cover) return;
    let objectUrl = '',
      started = false;
    const controller = new AbortController();
    const load = () => {
      if (started) return;
      started = true;
      void fetchCatalogBlob(ctx, source, cover, 'cover', controller.signal)
        .then((blob) => {
          if (
            controller.signal.aborted ||
            !/^image\/(jpeg|png|webp|gif|avif)(;|$)/i.test(blob.type)
          )
            return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch(() => {});
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                load();
                observer?.disconnect();
              }
            },
            { rootMargin: '200px' },
          );
    if (observer && ref.current) observer.observe(ref.current);
    else load();
    return () => {
      controller.abort();
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cover, ctx, source]);
  return (
    <div className="catalog-cover" ref={ref}>
      {url ? <img src={url} alt="" /> : <BookOpen aria-hidden="true" />}
    </div>
  );
}
export function Catalogs({
  onClose,
  onImport,
  onOpen,
  bookIds,
}: {
  onClose(): void;
  onImport(file: File, ctx: CatalogContext): Promise<string>;
  onOpen(id: string): void;
  bookIds: string[];
}) {
  const path = useWebPath(),
    [ctx, setCtx] = useState<CatalogContext>(),
    [sources, setSources] = useState<SavedCatalogSource[]>([]);
  const [stack, setStack] = useState<Destination[]>([]),
    [feed, setFeed] = useState<CatalogFeed>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [editing, setEditing] = useState<CatalogSource | null | undefined>(),
    [removing, setRemoving] = useState<CatalogSource>();
  const [selected, setSelected] = useState<CatalogPublication>(),
    [query, setQuery] = useState(''),
    [progress, setProgress] = useState<string>(),
    [imported, setImported] = useState<Record<string, string>>({});
  const controller = useRef<AbortController | undefined>(undefined),
    request = useRef(0);
  const params = new URLSearchParams(path.split('?')[1]);
  const destination = hostedWeb
    ? params.get('source')
      ? {
          sourceId: params.get('source')!,
          url: params.get('url') ?? '',
          title: '',
        }
      : undefined
    : stack.at(-1);
  const source = sources.find(
    (s) => s.id === destination?.sourceId && !s.deleted,
  );
  const refresh = async () => {
    setCtx(await catalogContext());
    setSources(await listCatalogSources());
  };
  useEffect(() => {
    let live = true;
    void refresh()
      .then(() => syncCatalogSources())
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) void refresh();
      });
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ctx || !source) return;
    const abort = new AbortController(),
      generation = ++request.current;
    setFeed(undefined);
    setLoading(true);
    setError('');
    setSelected(undefined);
    void fetchCatalog(ctx, source, destination?.url || source.url, abort.signal)
      .then(async (result) => {
        const parsed = parseCatalog(
          result.body,
          result.contentType,
          result.url,
        );
        const entries = [
          ...parsed.publications,
          ...parsed.groups.flatMap((g) => g.publications),
        ];
        const known: Record<string, string> = {};
        for (const entry of entries)
          for (const link of entry.acquisitions) {
            const id = await catalogImported(ctx, link.url);
            if (id && bookIds.includes(id)) known[link.url] = id;
          }
        if (!abort.signal.aborted && request.current === generation) {
          setFeed(parsed);
          setImported(known);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [ctx, source, destination?.url]);
  const go = (next?: Destination) => {
    if (progress) return;
    if (hostedWeb)
      navigateWeb(
        next
          ? `/catalogs?source=${encodeURIComponent(next.sourceId)}&url=${encodeURIComponent(next.url)}`
          : '/catalogs',
      );
    else setStack((prev) => (next ? [...prev, next] : []));
    setSelected(undefined);
  };
  const follow = (url: string, title: string) => {
    if (source) go({ sourceId: source.id, url, title });
  };
  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update catalog.');
    }
  };
  const download = async (publication: CatalogPublication, index: number) => {
    if (!ctx || !source || progress) return;
    const link = publication.acquisitions[index],
      abort = new AbortController();
    controller.current = abort;
    setProgress('Downloading…');
    setError('');
    try {
      const file = await downloadCatalogBook(
        ctx,
        source,
        link,
        publication.title,
        abort.signal,
        (n, total) =>
          setProgress(
            total
              ? `Downloading ${Math.min(100, Math.round((n / total) * 100))}%`
              : `Downloading ${(n / 1024 / 1024).toFixed(1)} MB`,
          ),
      );
      abort.signal.throwIfAborted();
      setProgress('Importing…');
      const id = await onImport(file, ctx);
      await catalogImported(ctx, link.url, id);
      setImported((prev) => ({ ...prev, [link.url]: id }));
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not download book.');
    } finally {
      setProgress(undefined);
      controller.current = undefined;
    }
  };
  const publications = (items: CatalogPublication[]) => (
    <div className="catalog-grid">
      {items.map((publication, i) => (
        <button
          key={publication.id + ':' + i}
          className="catalog-book"
          onClick={() => setSelected(publication)}
          disabled={!!progress}
        >
          <Cover ctx={ctx!} source={source!} publication={publication} />
          <strong>{publication.title}</strong>
          <span>{publication.authors.join(', ')}</span>
        </button>
      ))}
    </div>
  );
  return (
    <>
      <Modal
        title="Catalogs"
        className="catalog-dialog"
        placement="top"
        onClose={() => {
          controller.current?.abort();
          onClose();
        }}
      >
        <div className="catalog-browser">
          <nav className="catalog-breadcrumbs" aria-label="Catalog navigation">
            <button onClick={() => go()} disabled={!!progress}>
              Catalogs
            </button>
            {source && (
              <>
                <ChevronRight />
                <button
                  onClick={() =>
                    go({
                      sourceId: source.id,
                      url: source.url,
                      title: source.name,
                    })
                  }
                  disabled={!!progress}
                >
                  {source.name}
                </button>
                {feed && feed.url !== source.url && (
                  <>
                    <ChevronRight />
                    <span>{feed.title}</span>
                  </>
                )}
              </>
            )}
          </nav>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!destination ? (
            <>
              <div className="catalog-toolbar">
                <button className="primary" onClick={() => setEditing(null)}>
                  <Plus />
                  Add catalog
                </button>
                <button onClick={() => void run(syncCatalogSources)}>
                  Refresh
                </button>
              </div>
              {!sources.some((s) => !s.deleted) && (
                <p className="muted">
                  Add a catalog to browse and download books.
                </p>
              )}
              <div className="catalog-sources">
                {sources
                  .filter((s) => !s.deleted || s.conflict)
                  .map((s) => (
                    <div className="catalog-source" key={s.id}>
                      <button
                        className="catalog-source-open"
                        disabled={s.deleted}
                        onClick={() =>
                          go({ sourceId: s.id, url: s.url, title: s.name })
                        }
                      >
                        <Globe />
                        <span>
                          <strong>{s.name}</strong>
                          <small>{new URL(s.url).host}</small>
                        </span>
                        <ChevronRight />
                      </button>
                      <button
                        className="icon"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => setEditing(s)}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => setRemoving(s)}
                      >
                        <Trash2 />
                      </button>
                      {s.conflict && (
                        <div className="catalog-conflict">
                          <p>Changed on another device.</p>
                          <button
                            onClick={() =>
                              void run(async () => {
                                await resolveCatalogSource(s.id, true);
                                await syncCatalogSources();
                              })
                            }
                          >
                            Keep this version
                          </button>
                          <button
                            onClick={() =>
                              void run(async () => {
                                await resolveCatalogSource(s.id, false);
                                await syncCatalogSources();
                              })
                            }
                          >
                            Use server version
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="catalog-toolbar">
                <button
                  onClick={() => {
                    if (hostedWeb) history.back();
                    else setStack((s) => s.slice(0, -1));
                  }}
                  disabled={!!progress}
                >
                  <ArrowLeft />
                  Back
                </button>
                {source && (
                  <button onClick={() => setEditing(source)}>
                    <Pencil />
                    Edit catalog
                  </button>
                )}
              </div>
              {loading && <p role="status">Loading catalog…</p>}
              {!source && ctx && (
                <p role="alert">This catalog is no longer available.</p>
              )}
              {feed && (
                <>
                  <h3>{feed.title}</h3>
                  {feed.search && (
                    <form
                      className="catalog-search"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!query.trim() || !ctx || !source) return;
                        try {
                          let template = feed.search!.url;
                          if (
                            /opensearchdescription/.test(
                              feed.search!.type ?? '',
                            )
                          ) {
                            const description = await fetchCatalog(
                              ctx,
                              source,
                              template,
                              new AbortController().signal,
                            );
                            if (/<!DOCTYPE|<!ENTITY/i.test(description.body))
                              throw new Error('Invalid search description.');
                            const xml = new DOMParser().parseFromString(
                              description.body,
                              'application/xml',
                            );
                            template =
                              Array.from(xml.getElementsByTagNameNS('*', 'Url'))
                                .find((n) =>
                                  /atom|opds/.test(
                                    n.getAttribute('type') ?? '',
                                  ),
                                )
                                ?.getAttribute('template') ?? '';
                            if (!template)
                              throw new Error('No supported catalog search.');
                            template = catalogSearchUrl(
                              template,
                              query,
                              description.url,
                            );
                          } else
                            template = catalogSearchUrl(
                              template,
                              query,
                              feed.url,
                            );
                          follow(template, 'Search');
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : 'Search failed.',
                          );
                        }
                      }}
                    >
                      <input
                        aria-label="Search catalog"
                        placeholder="Search catalog"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button
                        disabled={!!progress || !query.trim()}
                        aria-label="Search"
                      >
                        <Search />
                      </button>
                    </form>
                  )}
                  {feed.facets.map((facet, i) => (
                    <div className="catalog-toolbar" key={i}>
                      <span>{facet.title}</span>
                      {facet.links.map((l) => (
                        <button
                          key={l.url}
                          disabled={!!progress}
                          onClick={() => follow(l.url, l.title)}
                        >
                          {l.title}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="catalog-navigation">
                    {feed.navigation.map((l) => (
                      <button
                        key={l.url}
                        onClick={() => follow(l.url, l.title)}
                        disabled={!!progress}
                      >
                        {l.title || 'Browse'}
                        <ChevronRight />
                      </button>
                    ))}
                  </div>
                  {publications(feed.publications)}
                  {feed.groups.map((group, i) => (
                    <section key={i}>
                      <h3>{group.title}</h3>
                      <div className="catalog-navigation">
                        {group.navigation.map((l) => (
                          <button
                            key={l.url}
                            onClick={() => follow(l.url, l.title)}
                          >
                            {l.title}
                            <ChevronRight />
                          </button>
                        ))}
                      </div>
                      {publications(group.publications)}
                    </section>
                  ))}
                  {!feed.publications.length &&
                    !feed.navigation.length &&
                    !feed.groups.length && <p>No books found.</p>}
                  <div className="catalog-toolbar">
                    {feed.previous && (
                      <button
                        disabled={!!progress}
                        onClick={() =>
                          follow(feed.previous!.url, 'Previous page')
                        }
                      >
                        Previous page
                      </button>
                    )}
                    {feed.next && (
                      <button
                        disabled={!!progress}
                        onClick={() => follow(feed.next!.url, 'Next page')}
                      >
                        Next page
                        <ChevronRight />
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {progress && (
            <div className="catalog-progress" role="status">
              <span>{progress}</span>
              <button
                disabled={progress === 'Importing…'}
                onClick={() => controller.current?.abort()}
              >
                <X />
                Cancel
              </button>
            </div>
          )}
        </div>
      </Modal>
      {editing !== undefined && (
        <SourceDialog
          source={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void refresh();
          }}
        />
      )}
      {removing && (
        <Modal title="Remove catalog?" onClose={() => setRemoving(undefined)}>
          <p>{removing.name}</p>
          <p>Books already imported stay in your library.</p>
          <div className="dialog-actions">
            <button onClick={() => setRemoving(undefined)}>Cancel</button>
            <button
              className="danger"
              onClick={() =>
                void run(async () => {
                  await deleteCatalogSource(removing.id);
                  setRemoving(undefined);
                  await syncCatalogSources();
                })
              }
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
      {selected && source && ctx && (
        <Modal
          title={selected.title}
          onClose={() => {
            if (!progress) setSelected(undefined);
          }}
        >
          <div className="catalog-publication">
            <p>{selected.authors.join(', ')}</p>
            {selected.summary && <p>{selected.summary}</p>}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {selected.acquisitions.map((l, i) => {
              const format = acquisitionFormat(l),
                id = imported[l.url];
              return format ? (
                <button
                  key={i}
                  disabled={!!progress}
                  className="primary"
                  onClick={() => (id ? onOpen(id) : void download(selected, i))}
                >
                  {id ? <BookOpen /> : <Download />}
                  {id ? 'Open book' : `Download ${format.toUpperCase()}`}
                </button>
              ) : (
                <p key={i} className="muted">
                  This edition requires a purchase, loan, or DRM service.
                </p>
              );
            })}
            {selected.detail && (
              <button
                disabled={!!progress}
                onClick={() => follow(selected.detail!.url, selected.title)}
              >
                View editions
                <ChevronRight />
              </button>
            )}
            {!selected.acquisitions.length && !selected.detail && (
              <p>No download available.</p>
            )}
            {progress && (
              <div className="catalog-progress" role="status">
                {progress}
                <button
                  disabled={progress === 'Importing…'}
                  onClick={() => controller.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
