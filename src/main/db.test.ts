import { resolve } from 'path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Conversation, Generation } from '@shared/types'
import * as db from './db'

beforeEach(() => {
  db.openDatabase(':memory:', resolve(process.cwd(), 'drizzle'))
})

afterEach(() => db.closeDatabase())

function makeGeneration(id: string, conversationId: string): Generation {
  return {
    id,
    conversationId,
    type: 'image',
    prompt: 'p',
    model: 'm',
    status: 'completed',
    params: {},
    assets: [],
    attachments: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

test('create, list and rename a conversation', () => {
  const conv: Conversation = {
    id: 'c1',
    title: 'First',
    createdAt: 1,
    updatedAt: 1
  }
  db.insertConversation(conv)
  expect(db.getAllConversations().map((c) => c.id)).toEqual(['c1'])

  const renamed = db.updateConversation('c1', { title: 'Renamed' })
  expect(renamed?.title).toBe('Renamed')
})

test('getGenerationsByConversation filters by parent', () => {
  db.insertConversation({ id: 'c1', title: 'c', createdAt: 1, updatedAt: 1 })
  db.insertGeneration(makeGeneration('g1', 'c1'))
  db.insertGeneration(makeGeneration('g2', 'c1'))
  expect(db.getGenerationsByConversation('c1').map((g) => g.id).sort()).toEqual(['g1', 'g2'])
})

test('deleteConversation cascades to its generations and returns their ids', () => {
  db.insertConversation({ id: 'c1', title: 'c', createdAt: 1, updatedAt: 1 })
  db.insertGeneration(makeGeneration('g1', 'c1'))
  db.insertGeneration(makeGeneration('g2', 'c1'))

  const deletedIds = db.deleteConversation('c1').sort()
  expect(deletedIds).toEqual(['g1', 'g2'])
  expect(db.getAllConversations()).toEqual([])
  expect(db.getGenerationsByConversation('c1')).toEqual([])
})
