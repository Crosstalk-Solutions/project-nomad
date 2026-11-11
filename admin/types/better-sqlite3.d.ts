declare module 'better-sqlite3' {
  export default class Database {
    constructor(
      path: string,
      options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }
    )
    prepare(sql: string): {
      all(...parameters: unknown[]): unknown[]
      get(...parameters: unknown[]): Record<string, unknown> | undefined
      run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    }
    exec(sql: string): this
    pragma(source: string, options?: { simple?: boolean }): unknown
    function(
      name: string,
      options: { deterministic?: boolean },
      callback: (...args: unknown[]) => number | string | null
    ): this
    close(): void
  }
}
