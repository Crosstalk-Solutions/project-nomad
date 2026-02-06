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
  const styles: Record<number, string> = {
    1: 'text-3xl font-bold text-desert-green-darker pb-3 mb-6 mt-2 border-b-2 border-desert-orange',
    2: 'text-2xl font-bold text-desert-green-dark pb-2 mb-5 mt-10 border-b border-desert-tan-lighter',
    3: 'text-xl font-semibold text-desert-green-dark mb-3 mt-8',
    4: 'text-lg font-semibold text-desert-green mb-2 mt-6',
    5: 'text-base font-semibold text-desert-green mb-2 mt-5',
    6: 'text-sm font-semibold text-desert-green mb-2 mt-4',
  }

  return (
    // @ts-ignore
    <Component id={id} className={styles[level]}>
      {children}
    </Component>
  )
}
