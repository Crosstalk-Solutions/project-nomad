import React, { JSX } from 'react'

export function Heading({
  level,
  id,
  children,
}: {
  level: number
  id: string
  children: React.ReactNode
}) {
  const Component = `h${level}` as keyof JSX.IntrinsicElements
  const sizes = {
    1: 'text-3xl font-bold',
    2: 'text-2xl font-semibold',
    3: 'text-xl font-semibold',
    4: 'text-lg font-semibold',
    5: 'text-base font-semibold',
    6: 'text-sm font-semibold',
  }

  return (
    // @ts-ignore
    <Component id={id} className={`${sizes[level]} mb-2 mt-6`}>
      {children}
    </Component>
  )
}
