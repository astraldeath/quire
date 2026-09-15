import {describe,it,expect} from 'vitest';
import {parseWebRoute,navigateWeb,closeWeb} from '../src/features/navigation/routes';
describe('WebUI navigation',()=>{
 it('recognizes encoded series, reader, and nested routes',()=>{
  expect(parseWebRoute('/series/A%2FB%20%26%20C/tracking')).toMatchObject({kind:'series-tracking',series:'A/B & C'});
  expect(parseWebRoute('/books/'+ 'a'.repeat(64) +'/read')).toMatchObject({kind:'read',bookId:'a'.repeat(64)});
  expect(parseWebRoute('/settings/backups')).toMatchObject({kind:'settings',tab:'backups'});
  expect(parseWebRoute('/admin/folders')).toMatchObject({kind:'admin',tab:'folders'});
  expect(parseWebRoute('/series/%E0%A4%A')).toMatchObject({kind:'not-found'});
 });
 it('preserves the shelf while opening nested destinations and rejects external URLs',()=>{
  history.replaceState(null,'','/series/Novels');navigateWeb('/books/'+ 'b'.repeat(64));
  expect(history.state.shelf).toBe('/series/Novels');
  navigateWeb('/settings/appearance');navigateWeb('/settings/backups',true);
  expect(history.state.from).toBe('/books/'+ 'b'.repeat(64));
  expect(()=>navigateWeb('https://evil.example')).toThrow();
  history.replaceState(null,'','/settings/backups');closeWeb('/library');expect(location.pathname).toBe('/library');
 });
});
