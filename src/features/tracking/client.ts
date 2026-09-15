import { isTauri } from '@tauri-apps/api/core';
import { loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
import { connectNativeTracking, nativeTrackingRequest } from './native';

export type TrackingSession =
  { kind: 'native' } | { kind: 'hosted'; account: Account };
export async function trackingSession(): Promise<TrackingSession> {
  if (isTauri()) return { kind: 'native' };
  const state = await loadSync();
  if (!state.enabled || !state.account)
    throw new Error('Sign in to your Quire server to use tracking.');
  return { kind: 'hosted', account: state.account };
}
export function trackingRequest(
  session: TrackingSession,
  path: string,
  body?: unknown,
  method?: string,
): Promise<any> {
  return session.kind === 'native'
    ? nativeTrackingRequest(path, body, method)
    : accountRequest(session.account, path, body, method);
}
export async function connectTracking(session: TrackingSession) {
  if (session.kind === 'native') {
    await connectNativeTracking();
    return;
  }
  const response = await trackingRequest(
    session,
    '/v1/tracking/oauth/start',
    {},
    'POST',
  );
  const url = new URL(response.url);
  if (
    url.origin !== 'https://mangabaka.org' ||
    url.pathname !== '/auth/oauth2/authorize'
  )
    throw new Error('Invalid MangaBaka authorization address.');
  window.location.assign(url.href);
}
