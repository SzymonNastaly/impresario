import type { Generation } from '@shared/types'

/** Turns of a conversation, oldest first (the feed appends at the bottom). */
export function conversationTurns(
  generations: Generation[],
  conversationId: string | null
): Generation[] {
  if (!conversationId) return []
  return generations
    .filter((g) => g.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
}
