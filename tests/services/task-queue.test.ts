import { describe, it, expect } from 'vitest'
import { TaskQueue } from '../../src/server/services/task-queue'

describe('TaskQueue', () => {
  it('should execute all items and return results in order', async () => {
    const queue = new TaskQueue(2)
    const items = [1, 2, 3, 4, 5]

    const results = await queue.run(items, async (item) => item * 2)

    expect(results).toHaveLength(5)
    expect(results.map((r) => r.result)).toEqual([2, 4, 6, 8, 10])
    expect(results.map((r) => r.item)).toEqual([1, 2, 3, 4, 5])
  })

  it('should handle empty items array', async () => {
    const queue = new TaskQueue(4)
    const results = await queue.run([], async (item: number) => item)
    expect(results).toHaveLength(0)
  })

  it('should capture errors without stopping other tasks', async () => {
    const queue = new TaskQueue(2)
    const items = [1, 2, 3]

    const results = await queue.run(items, async (item) => {
      if (item === 2) throw new Error('boom')
      return item * 10
    })

    expect(results).toHaveLength(3)
    expect(results[0]!.result).toBe(10)
    expect(results[1]!.error).toBeDefined()
    expect(results[1]!.error!.message).toBe('boom')
    expect(results[2]!.result).toBe(30)
  })

  it('should respect concurrency limit', async () => {
    const queue = new TaskQueue(2)
    let maxConcurrent = 0
    let currentConcurrent = 0

    const items = [1, 2, 3, 4, 5, 6]

    await queue.run(items, async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 50))
      currentConcurrent--
    })

    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('should work with concurrency of 1 (sequential)', async () => {
    const queue = new TaskQueue(1)
    const order: number[] = []

    await queue.run([1, 2, 3], async (item) => {
      order.push(item)
      return item
    })

    expect(order).toEqual([1, 2, 3])
  })

  it('should work when concurrency exceeds item count', async () => {
    const queue = new TaskQueue(100)
    const items = [1, 2, 3]

    const results = await queue.run(items, async (item) => item + 1)

    expect(results).toHaveLength(3)
    expect(results.map((r) => r.result)).toEqual([2, 3, 4])
  })

  it('should handle non-Error throws', async () => {
    const queue = new TaskQueue(2)

    const results = await queue.run([1], async () => {
      throw 'string error'
    })

    expect(results[0]!.error).toBeDefined()
    expect(results[0]!.error!.message).toBe('string error')
  })
})
