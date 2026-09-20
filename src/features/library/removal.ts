export function removalDescription(connected: boolean, count: number): string {
  return `This removes ${count === 1 ? 'this book' : `all ${count} books`}, ${count === 1 ? 'its' : 'their'} downloads, progress, bookmarks, highlights, and notes on this device. ${connected ? 'Reading-data removal syncs to your server and other devices when syncing runs. Downloads already on other devices are kept. ' : ''}Original book files, exported backups, and lifetime reading history are kept.`;
}
