export const KB_COLLECTIONS = [
  'food',
  'water',
  'shelter',
  'electricity',
  'survival',
  'farming',
  'computer',
  'medical',
  'boating',
] as const

export type KbCollection = (typeof KB_COLLECTIONS)[number]
