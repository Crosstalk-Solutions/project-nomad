export type NomadOllamaModel = {
  id: string
  name: string
  description: string
  estimated_pulls: string
  model_last_updated: string
  first_seen: string
  tags: NomadOllamaModelTag[]
}

export type NomadOllamaModelTag = {
  name: string
  size: string
  context: string
  input: string
}

export type NomadOllamaModelAPIResponse = {
  success: boolean
  message: string
  models: NomadOllamaModel[]
}

export type OllamaModelListing = {
  name: string
  id: string
  size: string
  modified: string
}
