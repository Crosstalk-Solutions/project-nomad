// Builder Tag word lists for generating unique, NOMAD-themed identifiers
// Format: [Adjective]-[Noun]-[4-digit number]

export const ADJECTIVES = [
  'Tactical',
  'Stealth',
  'Rogue',
  'Shadow',
  'Ghost',
  'Silent',
  'Covert',
  'Lone',
  'Nomad',
  'Digital',
  'Cyber',
  'Off-Grid',
  'Remote',
  'Arctic',
  'Desert',
  'Mountain',
  'Urban',
  'Bunker',
  'Hidden',
  'Secure',
  'Armored',
  'Fortified',
  'Mobile',
  'Solar',
  'Nuclear',
  'Storm',
  'Thunder',
  'Iron',
  'Steel',
  'Titanium',
  'Carbon',
  'Quantum',
  'Neural',
  'Alpha',
  'Omega',
  'Delta',
  'Sigma',
  'Apex',
  'Prime',
  'Elite',
  'Midnight',
  'Dawn',
  'Dusk',
  'Feral',
  'Relic',
  'Analog',
  'Hardened',
  'Vigilant',
  'Outland',
  'Frontier',
] as const

export const NOUNS = [
  'Llama',
  'Wolf',
  'Bear',
  'Eagle',
  'Falcon',
  'Hawk',
  'Raven',
  'Fox',
  'Coyote',
  'Panther',
  'Cobra',
  'Viper',
  'Phoenix',
  'Dragon',
  'Sentinel',
  'Guardian',
  'Ranger',
  'Scout',
  'Survivor',
  'Prepper',
  'Nomad',
  'Wanderer',
  'Drifter',
  'Outpost',
  'Shelter',
  'Bunker',
  'Vault',
  'Cache',
  'Haven',
  'Fortress',
  'Citadel',
  'Node',
  'Hub',
  'Grid',
  'Network',
  'Signal',
  'Beacon',
  'Tower',
  'Server',
  'Cluster',
  'Array',
  'Matrix',
  'Core',
  'Nexus',
  'Archive',
  'Relay',
  'Silo',
  'Depot',
  'Bastion',
  'Homestead',
] as const

export type Adjective = (typeof ADJECTIVES)[number]
export type Noun = (typeof NOUNS)[number]

export function generateRandomNumber(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function generateRandomBuilderTag(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const number = generateRandomNumber()
  return `${adjective}-${noun}-${number}`
}

export function parseBuilderTag(tag: string): {
  adjective: Adjective
  noun: Noun
  number: string
} | null {
  const match = tag.match(/^(.+)-(.+)-(\d{4})$/)
  if (!match) return null

  const [, adjective, noun, number] = match
  if (!ADJECTIVES.includes(adjective as Adjective)) return null
  if (!NOUNS.includes(noun as Noun)) return null

  return {
    adjective: adjective as Adjective,
    noun: noun as Noun,
    number,
  }
}

export function buildBuilderTag(adjective: string, noun: string, number: string): string {
  return `${adjective}-${noun}-${number}`
}
