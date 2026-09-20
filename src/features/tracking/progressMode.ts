export type ProgressMode = 'chapters' | 'volumes';

export function progressMode(volume: number): ProgressMode {
  return volume === 0 ? 'chapters' : 'volumes';
}

export function trackingVolume(
  mode: ProgressMode,
  volume: number | null,
): number {
  if (mode === 'chapters') return 0;
  if (volume === null || !Number.isFinite(volume) || volume <= 0)
    throw new Error('Enter a positive volume number.');
  return volume;
}
