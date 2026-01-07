export type DirectiveFn = (value: any, args: any) => any

export class DirectiveRegistry {
  private static registry = new Map<string, DirectiveFn>()

  static {
    this.register('alias', (val, args) => val) // Alias is handled by the key mapper
    this.register('coerce', (val, args) => {
      if (args.type === 'number') return Number(val)
      if (args.type === 'string') return String(val)
      return val
    })
    this.register('default', (val, args) => (val === null || val === undefined ? args.value : val))
    this.register('formatNumber', (val, args) => {
      if (typeof val !== 'number') return val
      const dec = Math.min(Math.max(0, args.dec || 2), 20) // Clamp to 0-20
      return Number(val.toFixed(dec))
    })
    this.register('substring', (val, args) => {
      if (typeof val !== 'string') return val
      const start = Math.max(0, args.start || 0)
      const len = Math.min(args.len || val.length, 10000) // Max 10k chars
      return val.substring(start, start + len)
    })
  }

  static register(name: string, fn: DirectiveFn) {
    this.registry.set(name, fn)
  }

  static execute(name: string, value: any, args: any): any {
    const fn = this.registry.get(name)
    return fn ? fn(value, args) : value
  }
}
