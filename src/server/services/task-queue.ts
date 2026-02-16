/**
 * Generic parallel task execution helper with controlled concurrency.
 */

export interface TaskResult<T, R> {
  item: T
  result?: R
  error?: Error
}

export class TaskQueue {
  constructor(private concurrency: number) {}

  async run<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<TaskResult<T, R>[]> {
    const results: TaskResult<T, R>[] = []
    let index = 0

    const runNext = async (): Promise<void> => {
      while (index < items.length) {
        const currentIndex = index++
        const item = items[currentIndex]!
        try {
          const result = await fn(item)
          results[currentIndex] = { item, result }
        } catch (err) {
          results[currentIndex] = { item, error: err instanceof Error ? err : new Error(String(err)) }
        }
      }
    }

    const workers = Array.from({ length: Math.min(this.concurrency, items.length) }, () =>
      runNext()
    )
    await Promise.all(workers)

    return results
  }
}
