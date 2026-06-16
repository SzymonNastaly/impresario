import { describe, expect, test } from 'vitest'
import type { Generation } from '@shared/types'
import { conversationTurns } from './turns'

function gen(id: string, conversationId: string, createdAt: number): Generation {
  return {
    id,
    conversationId,
    type: 'image',
    prompt: id,
    model: 'm',
    status: 'completed',
    params: {},
    assets: [],
    attachments: [],
    error: null,
    createdAt,
    updatedAt: createdAt
  }
}

describe('conversationTurns', () => {
  const all = [gen('a', 'c1', 30), gen('b', 'c1', 10), gen('c', 'c2', 20)]

  test('filters by conversation and sorts oldest-first', () => {
    expect(conversationTurns(all, 'c1').map((g) => g.id)).toEqual(['b', 'a'])
  })

  test('returns an empty array when no conversation is active', () => {
    expect(conversationTurns(all, null)).toEqual([])
  })

  test('returns an empty array for an unknown conversation', () => {
    expect(conversationTurns(all, 'missing')).toEqual([])
  })
})
