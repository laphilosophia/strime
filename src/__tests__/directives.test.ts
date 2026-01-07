import { describe, expect, it } from 'vitest'
import { query } from '../runtime/index'

describe('Strime Directives and Aliases', () => {
  const sample = {
    id: 1,
    firstName: 'Leanne',
    lastName: 'Graham',
    age: '25',
    score: 85.678,
    biography: 'Full-stack developer from Gwenborough',
  }

  it('should support @alias', async () => {
    const data = await query(sample, '{ first: firstName, last: lastName }')
    expect(data).toEqual({
      first: 'Leanne',
      last: 'Graham',
    })
  })

  it('should support @coerce', async () => {
    const data = await query(sample, '{ age @coerce(type: "number") }')
    expect(data.age).toBe(25)
    expect(typeof data.age).toBe('number')
  })

  it('should support @default', async () => {
    const data = await query(sample, '{ missing @default(value: "N/A"), firstName }')
    expect(data.missing).toBe('N/A')
    expect(data.firstName).toBe('Leanne')
  })

  it('should support @formatNumber', async () => {
    const data = await query(sample, '{ score @formatNumber(dec: 1) }')
    expect(data.score).toBe(85.7)
  })

  it('should support @substring', async () => {
    const data = await query(sample, '{ bio: biography @substring(start: 0, len: 10) }')
    expect(data.bio).toBe('Full-stack')
  })

  it('should support multiple directives', async () => {
    const data = await query(sample, '{ age @coerce(type: "number") @formatNumber(dec: 2) }')
    expect(data.age).toBe(25.0)
  })

  it('should enforce execution budgets for directives', async () => {
    // Clamped formatNumber (max 20)
    const data1 = await query(sample, '{ score @formatNumber(dec: 100) }')
    expect(data1.score.toString().split('.')[1]?.length).toBeLessThanOrEqual(20)

    // Clamped substring (max 10000)
    const longString = 'A'.repeat(20000)
    const data2 = await query({ long: longString }, '{ long @substring(len: 15000) }')
    expect(data2.long.length).toBe(10000)
  })
})
