/**
 * Shares one run of an async task between every caller that asks for the same
 * key while it is running.
 *
 * Used by `DockerService._createContainer` so that two installs of the same
 * service can't run side by side (#1439). Installing Ollama and Qdrant together
 * from the setup wizard starts Qdrant's own install, then Ollama's dependency
 * check, which sees Qdrant not yet installed and starts a second one. The second
 * hits Docker's 409 on the container name, and its failure cleanup removes the
 * container the first install created.
 *
 * The run is registered synchronously, before `start` yields, so a caller that
 * arrives on the next tick already finds it. It is removed once it settles,
 * whether it resolved or rejected, so a failed install can be retried.
 */
export function joinInFlight<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>
): Promise<T> {
  const running = inFlight.get(key)
  if (running) return running

  const run = start().finally(() => {
    if (inFlight.get(key) === run) inFlight.delete(key)
  })
  inFlight.set(key, run)
  return run
}
