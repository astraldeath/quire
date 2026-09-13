export interface Definition { part: string; text: string; example?: string; source?: string; license?: {name:string;url:string} }
const httpsUrl = (value: unknown): string | undefined => { if(typeof value!=='string')return;try{const url=new URL(value);return url.protocol==='https:'?url.href:undefined;}catch{return;} };
export async function lookupDefinition(term: string, signal?: AbortSignal): Promise<Definition[]> {
  const word = term.trim();
  if (!word || word.length > 80 || word.split(/\s+/).length > 4) throw new Error('Select a word or short phrase to define.');
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {signal, credentials:'omit', referrerPolicy:'no-referrer'});
  if (response.status === 404) throw new Error('No English definition found.');
  if (!response.ok) throw new Error('Dictionary unavailable. Please try again later.');
  const data = await response.json();
  const definitions: Definition[] = [];
  if (Array.isArray(data)) for (const entry of data) for (const meaning of entry.meanings ?? []) for (const item of meaning.definitions ?? []) {
    if (typeof item.definition === 'string') definitions.push({part:typeof meaning.partOfSpeech === 'string' ? meaning.partOfSpeech : '',text:item.definition,example:typeof item.example === 'string' ? item.example : undefined,source:httpsUrl(entry.sourceUrls?.[0]),license:typeof entry.license?.name==='string'&&httpsUrl(entry.license.url)?{name:entry.license.name,url:httpsUrl(entry.license.url)!}:undefined});
    if (definitions.length === 12) return definitions;
  }
  if (!definitions.length) throw new Error('No English definition found.');
  return definitions;
}
