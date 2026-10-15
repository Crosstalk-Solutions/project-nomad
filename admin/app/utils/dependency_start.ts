/**
 * Whether a "start" request should recreate the service's container instead of
 * starting it (#1426).
 *
 * A hidden dependency service (Qdrant) has no card on the Apps page, so the
 * Knowledge Base's "Start Qdrant" button is the only control a user has over it.
 * When its container is gone there is nothing to start, and the next container sync
 * marks the row not installed, so the only way back is to recreate it from the
 * stored config. Its data lives on a host bind mount, so recreating it loses nothing.
 * Every other service keeps the old answer: the user reinstalls it from the Apps page.
 */
export function recreatesOnStart(
  action: 'start' | 'stop' | 'restart',
  isDependencyService: boolean,
  containerExists: boolean
): boolean {
  return action === 'start' && isDependencyService && !containerExists
}
