export type LocationSharingState =
  | { state: 'idle' }
  | { state: 'requesting' }
  | { state: 'sharing'; sessionId: string; expiresAt: string }
  | { state: 'stopping'; sessionId: string }
  | { state: 'stopped' }
  | { state: 'error'; code: string };

export type LocationSharingEvent =
  | { type: 'REQUEST' }
  | { type: 'STARTED'; sessionId: string; expiresAt: string }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'FAILED'; code: string }
  | { type: 'EXPIRED' };

export function reduceLocationSharing(
  current: LocationSharingState,
  event: LocationSharingEvent,
): LocationSharingState {
  if (event.type === 'FAILED') return { state: 'error', code: event.code };
  if (event.type === 'REQUEST' && ['idle', 'stopped', 'error'].includes(current.state)) {
    return { state: 'requesting' };
  }
  if (event.type === 'STARTED' && current.state === 'requesting') {
    return { state: 'sharing', sessionId: event.sessionId, expiresAt: event.expiresAt };
  }
  if (event.type === 'STOP' && current.state === 'sharing') {
    return { state: 'stopping', sessionId: current.sessionId };
  }
  if (event.type === 'STOPPED' && current.state === 'stopping') return { state: 'stopped' };
  if (event.type === 'EXPIRED' && current.state === 'sharing') return { state: 'stopped' };
  return current;
}
