/** Serialize writes and coalesce pending choices so the last selection wins. */
export function createLatestSelectionSaver<Value, Result>(options: {
  save: (value: Value) => Promise<Result>
  committed: (result: Result, latest: boolean) => void | Promise<void>
  failed: (error: unknown) => void
}) {
  let revision = 0
  type Callbacks = { committed?: (result: Result) => void; failed?: (error: unknown) => void }
  let pending: { value: Value; revision: number; callbacks?: Callbacks } | undefined
  let running = false
  const idle: (() => void)[] = []

  const drain = async () => {
    running = true
    try {
      while (pending) {
        const next = pending
        pending = undefined
        try {
          const result = await options.save(next.value)
          await options.committed(result, next.revision === revision)
          if (next.revision === revision) next.callbacks?.committed?.(result)
        } catch (error) {
          // An earlier failed choice must not obscure a newer pending choice.
          if (next.revision === revision) {
            if (next.callbacks?.failed) next.callbacks.failed(error)
            else options.failed(error)
          }
        }
      }
    } finally {
      running = false
      for (const resolve of idle.splice(0)) resolve()
    }
  }

  return {
    select(value: Value, callbacks?: Callbacks) {
      pending = { value, revision: ++revision, callbacks }
      if (!running) void drain()
    },
    whenIdle() {
      return running ? new Promise<void>((resolve) => idle.push(resolve)) : Promise.resolve()
    },
  }
}
