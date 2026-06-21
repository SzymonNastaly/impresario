import { describe, expect, test } from 'vitest'
import { seededFavorites } from './settings'

describe('seededFavorites', () => {
  test('returns the seeds when nothing is stored yet', () => {
    expect(seededFavorites(undefined, ['a', 'b'])).toEqual(['a', 'b'])
  })

  test('returns the stored list once it exists, even if empty', () => {
    expect(seededFavorites(['x'], ['a', 'b'])).toEqual(['x'])
    expect(seededFavorites([], ['a', 'b'])).toEqual([])
  })
})
