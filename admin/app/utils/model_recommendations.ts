import type { NomadOllamaModel, NomadOllamaModelTag } from '../../types/ollama.js'

function tagAcceptsImages(tag: NomadOllamaModelTag): boolean {
  return tag.input
    .toLowerCase()
    .split(/[^a-z]+/)
    .includes('image')
}

export function modelAcceptsImages(model: NomadOllamaModel): boolean {
  return model.tags.some(tagAcceptsImages)
}

function preferredTag(model: NomadOllamaModel): NomadOllamaModelTag | undefined {
  return model.tags.find(tagAcceptsImages) ?? model.tags[0]
}

export function selectRecommendedModels(
  modelsByPopularity: NomadOllamaModel[],
  limit = 3
): NomadOllamaModel[] {
  if (limit <= 0) return []

  const selected = modelsByPopularity.slice(0, limit)
  if (!selected.some(modelAcceptsImages)) {
    const visionModel = modelsByPopularity.find(modelAcceptsImages)
    if (visionModel) {
      if (selected.length === limit) selected[selected.length - 1] = visionModel
      else selected.push(visionModel)
    }
  }

  return selected.map((model) => {
    const tag = preferredTag(model)
    return { ...model, tags: tag ? [tag] : [] }
  })
}
