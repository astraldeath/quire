/** Detached publication documents have no layout engine. When CSS declarations
 * conflict, preserve prose rather than guessing which selector/layer wins. Live
 * reader documents use the browser's computed cascade instead. */
export function publicationVisibility(doc: Document, styles: string[]) {
  type Declaration = {
    selector: string;
    display: string;
    visibility: string;
    certain: boolean;
  };
  const declarations: Declaration[] = [];
  const mediaMatches = (query: string): boolean | undefined => {
    if (!query.trim()) return true;
    if (typeof matchMedia === 'function') return matchMedia(query).matches;
    const choices = query
      .toLowerCase()
      .split(',')
      .map((value) => value.trim());
    if (choices.some((value) => value === 'all' || value === 'screen'))
      return true;
    if (choices.every((value) => value === 'print' || value === 'speech'))
      return false;
    return undefined;
  };
  const parse = (css: string, applicable: boolean | undefined = true) => {
    if (applicable === false || typeof CSSStyleSheet !== 'function') return;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        css.replace(/@import\s+(?:url\([^;]*\)|["'][^"']*["'])[^;]*;/gi, ''),
      );
      const visit = (rules: CSSRuleList, certain: boolean) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            declarations.push({
              selector: rule.selectorText,
              display: rule.style.display,
              visibility: rule.style.visibility,
              certain,
            });
          } else if ('cssRules' in rule) {
            let active: boolean | undefined;
            if (rule instanceof CSSMediaRule)
              active = mediaMatches(rule.conditionText);
            else if (
              typeof CSSSupportsRule !== 'undefined' &&
              rule instanceof CSSSupportsRule
            )
              active =
                typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
                  ? CSS.supports(rule.conditionText)
                  : undefined;
            // Unknown grouping conditions cannot safely exclude visible prose.
            if (active !== false)
              visit(
                (rule as CSSGroupingRule).cssRules,
                certain && active === true,
              );
          }
        }
      };
      visit(sheet.cssRules, applicable === true);
    } catch {
      /* Unsupported CSS is not evidence that prose is hidden. */
    }
  };
  for (const css of styles) parse(css);
  for (const style of doc.querySelectorAll('style'))
    parse(
      style.textContent ?? '',
      mediaMatches(style.getAttribute('media') ?? ''),
    );
  return (element: HTMLElement): { display: string; visibility: string } => {
    if (doc.defaultView) {
      const computed = doc.defaultView.getComputedStyle(element);
      return { display: computed.display, visibility: computed.visibility };
    }
    const matched = declarations.filter((rule) => {
      try {
        return element.matches(rule.selector);
      } catch {
        return false;
      }
    });
    const property = (name: 'display' | 'visibility') => {
      const inline = element.style?.[name];
      const values = matched.map((rule) => ({
        value: rule[name],
        certain: rule.certain,
      }));
      if (inline) values.push({ value: inline, certain: true });
      const hidden = (value: string) =>
        name === 'display'
          ? value === 'none'
          : value === 'hidden' || value === 'collapse';
      // A potential visible override wins in detached documents. This deliberately
      // prefers including ambiguous text to irreversibly dropping visible prose.
      if (values.some(({ value }) => value && !hidden(value)))
        return name === 'display' ? 'block' : 'visible';
      return values.some(({ value, certain }) => certain && hidden(value))
        ? name === 'display'
          ? 'none'
          : 'hidden'
        : '';
    };
    return { display: property('display'), visibility: property('visibility') };
  };
}
