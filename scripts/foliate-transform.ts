import { createHash } from 'node:crypto';

/** Reviewed adaptation of upstream MIT foliate-js 1.0.1 paginator View.load.
 * EPUB scripts are removed and blocked by the sanitized document CSP.
 * Keep allow-scripts so WebKit can invoke trusted parent-installed listeners;
 * readiness polling provides an independent load signal.
 * Both signals share one guarded callback and a bounded, diagnostic deadline.
 */
const loadMethod = `    async load(src, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(String(src) + ' is not string')
        return new Promise((resolve, reject) => {
            let finished = false
            let observed = 'unavailable'
            let polling, deadline
            const cleanup = () => {
                clearInterval(polling)
                clearTimeout(deadline)
                this.#iframe.removeEventListener('load', onLoad)
            }
            const onLoad = () => {
                if (finished) return
                const doc = this.document
                if (!doc || doc.URL !== src || doc.readyState !== 'complete') return
                finished = true
                cleanup()
                try {
                    afterLoad?.(doc)
                    this.#iframe.style.display = 'block'
                    const { vertical, rtl } = getDirection(doc)
                    this.docBackground = getBackground(doc)
                    doc.body.style.background = 'none'
                    const background = this.docBackground
                    this.#iframe.style.display = 'none'
                    this.#vertical = vertical
                    this.#rtl = rtl
                    this.#contentRange.selectNodeContents(doc.body)
                    const layout = beforeRender?.({ vertical, rtl, background })
                    this.#iframe.style.display = 'block'
                    this.render(layout)
                    this.#observer.observe(doc.body)
                    doc.fonts.ready.then(() => this.expand()).catch(() => {})
                    resolve()
                } catch (error) { reject(error) }
            }
            this.#iframe.addEventListener('load', onLoad)
            polling = setInterval(() => {
                try {
                    const doc = this.document
                    observed = doc ? doc.readyState + (doc.URL === src ? ' (book)' : ' (blank)') : 'unavailable'
                    onLoad()
                } catch (error) {
                    finished = true
                    cleanup()
                    reject(error)
                }
            }, 50)
            deadline = setTimeout(() => {
                if (finished) return
                finished = true
                cleanup()
                reject(new Error('Book frame load timed out; document readiness: ' + observed))
            }, 15000)
            this.#iframe.src = src
        })
    }
`;

export function hardenFoliate(
  code: string,
  id: string,
  hosted = false,
): string | undefined {
  if (
    id
      .split('?')[0]
      .replaceAll('\\', '/')
      .endsWith('/foliate-js/fixed-layout.js')
  ) {
    const normalized = code.replaceAll('\r\n', '\n');
    const start = normalized.indexOf('    async #createFrame(');
    const end = normalized.indexOf('    #render(side', start);
    const method = normalized.slice(start, end);
    if (
      start < 0 ||
      end < 0 ||
      createHash('sha256').update(method).digest('hex') !==
        '4f9d012392b52a048d8d453f8b6af573968db1f8acdb19594588c1fc367fccd7'
    )
      throw new Error(
        'Review foliate fixed-layout frame loading before upgrading the renderer.',
      );
    const promise = method.indexOf('        return new Promise(resolve => {');
    const safe =
      method.slice(0, promise) +
      `        const response = await fetch(src); if (!response.ok) throw new Error('Could not load book page'); let markup = await response.text();
        // srcdoc uses the HTML parser; give standalone SVG spine pages an HTML
        // viewport and CSP without changing their authored coordinate system.
        const sourceDoc = new DOMParser().parseFromString(markup, 'application/xml')
        if (sourceDoc.documentElement.localName === 'svg') {
            const svg = sourceDoc.documentElement
            const viewport = getViewport(sourceDoc, this.defaultViewport)
            const wrapper = document.implementation.createHTMLDocument('')
            const policy = wrapper.createElement('meta')
            policy.httpEquiv = 'Content-Security-Policy'
            policy.content = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; base-uri 'none'; form-action 'none'"
            const meta = wrapper.createElement('meta')
            meta.name = 'viewport'
            meta.content = 'width=' + viewport.width + ',height=' + viewport.height
            wrapper.head.prepend(policy, meta)
            wrapper.documentElement.style.height = '100%'
            wrapper.body.style.margin = '0'
            wrapper.body.style.height = '100%'
            svg.style.width = '100%'
            svg.style.height = '100%'
            svg.style.display = 'block'
            wrapper.body.append(wrapper.importNode(svg, true))
            markup = wrapper.documentElement.outerHTML
        }
        return new Promise((resolve, reject) => {
            let finished = false, polling, deadline, observed = 'unavailable'
            const cleanup = () => {
                clearInterval(polling); clearTimeout(deadline)
                iframe.removeEventListener('load', onLoad)
            }
            const onLoad = () => {
                if (finished) return
                try {
                    const doc = iframe.contentDocument
                    observed = doc ? doc.URL + ' (' + doc.readyState + ')' : 'unavailable'
                    if (!doc || doc.URL !== 'about:srcdoc' || doc.readyState !== 'complete') return
                    finished = true; cleanup()
                    this.dispatchEvent(new CustomEvent('load', { detail: { doc, index } }))
                    const { width, height } = getViewport(doc, this.defaultViewport)
                    if (![width, height].every(value => Number.isFinite(parseFloat(value)) && parseFloat(value) > 0)) throw new Error('Book page has an invalid viewport')
                    resolve({ element, iframe, width: parseFloat(width), height: parseFloat(height), onZoom })
                } catch (error) { finished = true; cleanup(); reject(error) }
            }
            iframe.addEventListener('load', onLoad)
            polling = setInterval(onLoad, 50)
            deadline = setTimeout(() => {
                finished = true; cleanup(); reject(new Error('Book page frame load timed out; document readiness: ' + observed))
            }, 15000)
            iframe.srcdoc = markup
        })
    }
`;
    // Guard all additional adaptations against dependency drift too.
    const replacements = [
      [
        'return parseViewport(viewport)',
        'return Object.fromEntries(parseViewport(viewport))',
      ],
      ["this.side === 'left'", "this.#side === 'left'"],
      [
        "            this.#side = 'left'\n            return true",
        "            this.#side = 'left'\n            this.#render()\n            return true",
      ],
      [
        "            this.#side = 'right'\n            return true",
        "            this.#side = 'right'\n            this.#render()\n            return true",
      ],
      [
        '            this.#render(side)\n            return',
        '            this.#side = side ?? this.#side\n            this.#render()\n            this.#reportLocation(reason)\n            return',
      ],
      [
        '        this.#index = index\n        const spread',
        '        const spread',
      ],
      [
        '        this.#reportLocation(reason)\n    }\n    async select',
        '        this.#index = index\n        this.#reportLocation(reason)\n    }\n    async select',
      ],
      [
        '    get index() {',
        '    get atStart() { return this.index === 0 }\n    get atEnd() { return this.#index === this.#spreads.length - 1 && (!this.#portrait || this.index === this.book.sections.length - 1) }\n    get index() {',
      ],
      ['    #index = -1', '    #index = -1\n    #closed = false'],
      [
        '        const section = spread?.center',
        '        if (!spread) return -1\n        const section = spread?.center',
      ],
      [
        '        const spread = this.#spreads[index]\n        if (spread.center)',
        `        if (this.#closed) throw new Error('Reader is closed')
        const previous = this.#spreads[this.#index]
        const spread = this.#spreads[index]
        try {
        if (spread.center)`,
      ],
      [
        '        this.#index = index\n        this.#reportLocation(reason)',
        `        if (this.#closed) throw new Error('Reader is closed')
        for (const section of Object.values(previous ?? {})) section?.unload?.()
        this.#index = index
        this.#reportLocation(reason)
        } catch (error) {
            // A partial frame failure may already have removed the old spread.
            // Release both sets and invalidate the index so any retry reloads it.
            this.#root.replaceChildren()
            this.#left = this.#right = this.#center = null
            this.#side = null
            for (const section of new Set([...Object.values(previous ?? {}), ...Object.values(spread)])) section?.unload?.()
            this.#index = -1
            throw error
        }`,
      ],
      [
        '    destroy() {\n        this.#observer.unobserve(this)',
        `    destroy() {
        this.#closed = true
        this.#root.replaceChildren()
        for (const section of Object.values(this.#spreads?.[this.#index] ?? {})) section?.unload?.()
        this.#index = -1
        this.#left = this.#right = this.#center = null
        this.#side = null
        this.#observer.unobserve(this)`,
      ],
    ];
    let output = normalized.slice(0, start) + safe + normalized.slice(end);
    for (const [before, after] of replacements) {
      if (output.split(before).length !== 2)
        throw new Error(
          'Review foliate fixed-layout navigation before upgrading the renderer.',
        );
      output = output.replace(before, after);
    }
    return output;
  }
  if (
    !id.split('?')[0].replaceAll('\\', '/').endsWith('/foliate-js/paginator.js')
  )
    return;
  const normalized = code.replaceAll('\r\n', '\n');
  const start = normalized.indexOf(
    '    async load(src, afterLoad, beforeRender) {',
  );
  const end = normalized.indexOf('    render(layout) {', start);
  const original = "'allow-same-origin allow-scripts'";
  const method = normalized.slice(start, end);
  if (
    start < 0 ||
    end < 0 ||
    createHash('sha256').update(method).digest('hex') !==
      '4aed7675f9eeafcbea035d4c0f7b9babc3f12505ef0aeb45bdb9d31c9e17ac7e' ||
    normalized.split(original).length !== 2
  ) {
    throw new Error(
      'Review foliate iframe sandbox and load lifecycle before upgrading the renderer.',
    );
  }
  const turnStart = normalized.indexOf('    async #turnPage(dir, distance) {');
  const turnEnd = normalized.indexOf('    async prev(distance)', turnStart);
  const turnMethod = normalized.slice(turnStart, turnEnd);
  if (
    createHash('sha256').update(turnMethod).digest('hex') !==
    '54cd719e2da3783549906b32e4e9e8dda488fc68edaff36b27559d9d296043ed'
  )
    throw new Error(
      'Review foliate page-turn locking before upgrading the renderer.',
    );
  const safeTurn = turnMethod
    .replace('        const prev =', '        try {\n        const prev =')
    .replace(
      '        this.#locked = false',
      '        } finally { this.#locked = false }',
    );
  const browserLoad = hosted
    ? loadMethod
        .replace(
          'return new Promise((resolve, reject) => {',
          "const response = await fetch(src); if (!response.ok) throw new Error('Could not load chapter'); const markup = await response.text(); return new Promise((resolve, reject) => {",
        )
        .replaceAll('doc.URL !== src', "doc.URL !== 'about:srcdoc'")
        .replaceAll('doc.URL === src', "doc.URL === 'about:srcdoc'")
        .replace('this.#iframe.src = src', 'this.#iframe.srcdoc = markup')
    : loadMethod;
  return (
    normalized.slice(0, start) +
    browserLoad +
    normalized.slice(end)
  ).replace(turnMethod, safeTurn);
}
