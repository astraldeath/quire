export interface DefinitionGroup {
  partOfSpeech: string;
  senses: string[];
}
export function wiktionaryUrl(term: string): string {
  const word = term.trim();
  if (!word || word.length > 80 || word.split(/\s+/).length > 4)
    throw new Error('Select a word or short phrase to define.');
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#English`;
}
/** Parse in an inert template; only plain strings ever reach the rendered dialog. */
export function parseDefinitions(html: string): DefinitionGroup[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  const groups: DefinitionGroup[] = [];
  let english = false;
  let part = '';
  const parts = new Set([
    'Noun',
    'Proper noun',
    'Verb',
    'Adjective',
    'Adverb',
    'Pronoun',
    'Preposition',
    'Conjunction',
    'Interjection',
    'Determiner',
    'Article',
    'Numeral',
    'Particle',
    'Phrase',
    'Prefix',
    'Suffix',
    'Abbreviation',
    'Initialism',
    'Letter',
    'Symbol',
    'Contraction',
    'Proverb',
  ]);
  for (const node of template.content.querySelectorAll('h2,h3,h4,h5,h6,ol')) {
    if (node.tagName === 'H2') {
      english = node.textContent?.trim() === 'English';
      part = '';
      continue;
    }
    if (!english) continue;
    if (node.tagName !== 'OL') {
      const heading = node.textContent?.replace(/\[edit\]/g, '').trim() ?? '';
      part = parts.has(heading) ? heading : '';
      continue;
    }
    if (!part || node.closest('li')) continue;
    const senses = Array.from(node.children)
      .filter((n) => n.tagName === 'LI')
      .map((n) => {
        const copy = n.cloneNode(true) as Element;
        copy
          .querySelectorAll('dl,ul,ol,script,style,sup,.citation,.HQToggle')
          .forEach((el) => el.remove());
        return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      })
      .filter(Boolean);
    if (senses.length) groups.push({ partOfSpeech: part, senses });
  }
  return groups;
}
export async function lookupDefinition(
  term: string,
  signal: AbortSignal,
): Promise<DefinitionGroup[]> {
  wiktionaryUrl(term);
  const params = new URLSearchParams({
    action: 'parse',
    page: term.trim(),
    prop: 'text',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    disableeditsection: '1',
  });
  let response: Response;
  try {
    response = await fetch(`https://en.wiktionary.org/w/api.php?${params}`, {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(
      'Could not reach Wiktionary. Check your connection and try again.',
    );
  }
  if (!response.ok)
    throw new Error('Wiktionary is unavailable. Try again later.');
  const data = await response.json();
  if (data.error && data.error.code !== 'missingtitle')
    throw new Error(
      'Wiktionary could not load this entry. Try opening the source.',
    );
  const groups =
    typeof data.parse?.text === 'string'
      ? parseDefinitions(data.parse.text)
      : [];
  if (!groups.length)
    throw new Error(
      'No English definition found. Try opening the Wiktionary entry.',
    );
  return groups;
}
