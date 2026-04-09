/**
 * Select the model to use for RAG query rewriting.
 *
 * Prefers `preferredModelName` when available; falls back to the first model
 * in the list so that query rewriting works regardless of which model the user
 * has installed. Returns `undefined` only when no models are available at all.
 */
export function selectRewriteModel(
  installedModels: { name: string }[],
  preferredModelName: string
): { model: string | undefined; isFallback: boolean } {
  const preferred = installedModels.find((m) => m.name === preferredModelName)
  if (preferred) {
    return { model: preferred.name, isFallback: false }
  }
  const fallback = installedModels[0]?.name
  return { model: fallback, isFallback: true }
}
