/** The entry stays on Wiktionary's origin; no remote HTML runs in Quire's document. */
export function wiktionaryUrl(term: string): string {
  const word=term.trim();
  if(!word||word.length>80||word.split(/\s+/).length>4)throw new Error('Select a word or short phrase to define.');
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}?useskin=minerva#English`;
}
