import { useState, useEffect } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import {
  ADJECTIVES,
  NOUNS,
  generateRandomNumber,
  generateRandomBuilderTag,
  parseBuilderTag,
  buildBuilderTag,
} from '~/lib/builderTagWords'

interface BuilderTagSelectorProps {
  value: string | null
  onChange: (tag: string) => void
  disabled?: boolean
}

export default function BuilderTagSelector({
  value,
  onChange,
  disabled = false,
}: BuilderTagSelectorProps) {
  const [adjective, setAdjective] = useState<string>(ADJECTIVES[0])
  const [noun, setNoun] = useState<string>(NOUNS[0])
  const [number, setNumber] = useState<string>(generateRandomNumber())

  // Parse existing value on mount
  useEffect(() => {
    if (value) {
      const parsed = parseBuilderTag(value)
      if (parsed) {
        setAdjective(parsed.adjective)
        setNoun(parsed.noun)
        setNumber(parsed.number)
      }
    } else {
      // Generate a random tag for new users
      const randomTag = generateRandomBuilderTag()
      const parsed = parseBuilderTag(randomTag)
      if (parsed) {
        setAdjective(parsed.adjective)
        setNoun(parsed.noun)
        setNumber(parsed.number)
        onChange(randomTag)
      }
    }
  }, [])

  // Update parent when selections change
  const updateTag = (newAdjective: string, newNoun: string, newNumber: string) => {
    const tag = buildBuilderTag(newAdjective, newNoun, newNumber)
    onChange(tag)
  }

  const handleAdjectiveChange = (newAdjective: string) => {
    setAdjective(newAdjective)
    updateTag(newAdjective, noun, number)
  }

  const handleNounChange = (newNoun: string) => {
    setNoun(newNoun)
    updateTag(adjective, newNoun, number)
  }

  const handleRandomize = () => {
    const newAdjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const newNoun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const newNumber = generateRandomNumber()
    setAdjective(newAdjective)
    setNoun(newNoun)
    setNumber(newNumber)
    updateTag(newAdjective, newNoun, newNumber)
  }

  const currentTag = buildBuilderTag(adjective, noun, number)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={adjective}
          onChange={(e) => handleAdjectiveChange(e.target.value)}
          disabled={disabled}
          className="px-3 py-2 bg-desert-stone-lighter border border-desert-stone-light rounded-lg text-desert-green font-medium focus:outline-none focus:ring-2 focus:ring-desert-green disabled:opacity-50"
        >
          {ADJECTIVES.map((adj) => (
            <option key={adj} value={adj}>
              {adj}
            </option>
          ))}
        </select>

        <span className="text-desert-stone-dark font-bold">-</span>

        <select
          value={noun}
          onChange={(e) => handleNounChange(e.target.value)}
          disabled={disabled}
          className="px-3 py-2 bg-desert-stone-lighter border border-desert-stone-light rounded-lg text-desert-green font-medium focus:outline-none focus:ring-2 focus:ring-desert-green disabled:opacity-50"
        >
          {NOUNS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <span className="text-desert-stone-dark font-bold">-</span>

        <span className="px-3 py-2 bg-desert-stone-lighter border border-desert-stone-light rounded-lg text-desert-green font-mono font-bold">
          {number}
        </span>

        <button
          type="button"
          onClick={handleRandomize}
          disabled={disabled}
          className="p-2 text-desert-stone-dark hover:text-desert-green hover:bg-desert-stone-lighter rounded-lg transition-colors disabled:opacity-50"
          title="Randomize"
        >
          <ArrowPathIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-desert-stone-dark">Your Builder Tag:</span>
        <span className="font-mono font-bold text-desert-green">{currentTag}</span>
      </div>
    </div>
  )
}
