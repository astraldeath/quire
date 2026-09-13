import { createHash } from 'node:crypto';

/** Reviewed adaptation of upstream MIT foliate-js 1.0.1 paginator View.load.
 * Keep scripts sandboxed. Some WebKit versions suppress load events on a
 * script-disabled frame; readiness polling provides an independent signal.
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

export function hardenFoliate(code: string, id: string): string | undefined {
  if (!id.replaceAll('\\', '/').endsWith('/foliate-js/paginator.js')) return;
  const normalized = code.replaceAll('\r\n', '\n');
  const start = normalized.indexOf('    async load(src, afterLoad, beforeRender) {');
  const end = normalized.indexOf('    render(layout) {', start);
  const original = "'allow-same-origin allow-scripts'";
  const method = normalized.slice(start, end);
  if (start < 0 || end < 0 || createHash('sha256').update(method).digest('hex') !== '4aed7675f9eeafcbea035d4c0f7b9babc3f12505ef0aeb45bdb9d31c9e17ac7e' || normalized.split(original).length !== 2) {
    throw new Error('Review foliate iframe sandbox and load lifecycle before upgrading the renderer.');
  }
  const turnStart = normalized.indexOf('    async #turnPage(dir, distance) {');
  const turnEnd = normalized.indexOf('    async prev(distance)', turnStart);
  const turnMethod = normalized.slice(turnStart, turnEnd);
  if (createHash('sha256').update(turnMethod).digest('hex') !== '54cd719e2da3783549906b32e4e9e8dda488fc68edaff36b27559d9d296043ed') throw new Error('Review foliate page-turn locking before upgrading the renderer.');
  const safeTurn = turnMethod.replace('        const prev =', '        try {\n        const prev =').replace('        this.#locked = false', '        } finally { this.#locked = false }');
  return (normalized.slice(0, start) + loadMethod + normalized.slice(end)).replace(original, "'allow-same-origin'").replace(turnMethod, safeTurn);
}
