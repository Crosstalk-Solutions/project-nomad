/**
 * Recognize the daemon errors that mean "NVIDIA GPU passthrough is unusable on
 * this host right now", so the Ollama install can fall back to CPU-only instead
 * of dying outright (#1641).
 *
 * Detection only proves the nvidia runtime is registered with Docker. Whether the
 * driver underneath actually works is only known when the container starts, e.g.
 * after a driver upgrade without a reboot:
 *
 *   (HTTP code 500) server error - failed to create task for container: ...
 *   error running prestart hook #0: exit status 1, stdout: , stderr: Auto-detected
 *   mode as 'legacy' nvidia-container-cli: initialization error: nvml error:
 *   driver/library version mismatch
 *
 * Kept pure so it runs under bare `node --test`.
 */

// `nvidia-container-cli` is the toolkit's prestart hook, so it only ever shows up
// when the NVIDIA device request is what failed. The second phrase is what the
// daemon says when the request reaches it but no nvidia device driver is wired up.
const NVIDIA_START_ERROR_RE = /nvidia-container-cli: |could not select device driver "nvidia"/i

const DRIVER_MISMATCH_RE = /driver\/library version mismatch/i

function rawMessage(error: unknown): string {
  return (error as { message?: string })?.message ?? String(error)
}

/** True when a container start failed because of the NVIDIA device request. */
export function isNvidiaStartError(error: unknown): boolean {
  return NVIDIA_START_ERROR_RE.test(rawMessage(error))
}

/**
 * The message shown to the user when the install falls back to CPU-only. A
 * driver/library mismatch has a known fix (the kernel module is older than the
 * userspace driver, usually after a driver update), so say so plainly.
 */
export function describeNvidiaStartError(error: unknown): string {
  const base =
    'NVIDIA GPU detected, but Docker could not start a container with GPU access. ' +
    'Installing CPU-only instead so the AI Assistant still works.'
  if (DRIVER_MISMATCH_RE.test(rawMessage(error))) {
    return (
      `${base} The NVIDIA driver and its kernel module are different versions, which usually ` +
      'means the driver was updated without a reboot. Reboot this machine, check that ' +
      '"nvidia-smi" works, then reinstall the AI Assistant for GPU acceleration.'
    )
  }
  return (
    `${base} Check that "nvidia-smi" works on the host and that the NVIDIA Container Toolkit ` +
    'is installed, then reinstall the AI Assistant for GPU acceleration.'
  )
}
