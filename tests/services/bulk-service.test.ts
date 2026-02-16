import { describe, it, expect } from 'vitest'
import { BulkService } from '../../src/server/services/bulk-service'

describe('BulkService', () => {
  describe('parseCoverage', () => {
    const service = new BulkService(4)

    it('should parse standard vitest coverage output', () => {
      const stdout = `
 % Coverage report from v8
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   94.23 |    88.12 |     100 |   94.23 |
 index.ts |   94.23 |    88.12 |     100 |   94.23 |
----------|---------|----------|---------|---------|`

      expect(service.parseCoverage(stdout)).toBe(94.23)
    })

    it('should parse 100% coverage', () => {
      const stdout = 'All files |     100 |      100 |     100 |     100 |'
      expect(service.parseCoverage(stdout)).toBe(100)
    })

    it('should parse 0% coverage', () => {
      const stdout = 'All files |       0 |        0 |       0 |       0 |'
      expect(service.parseCoverage(stdout)).toBe(0)
    })

    it('should parse coverage with no decimals', () => {
      const stdout = 'All files |      85 |       90 |      75 |      85 |'
      expect(service.parseCoverage(stdout)).toBe(85)
    })

    it('should return null when no coverage output present', () => {
      const stdout = 'Tests passed: 5/5\nAll tests completed successfully.'
      expect(service.parseCoverage(stdout)).toBeNull()
    })

    it('should return null for empty stdout', () => {
      expect(service.parseCoverage('')).toBeNull()
    })

    it('should parse coverage with extra whitespace', () => {
      const stdout = 'All files   |  72.5  |  60.1  |  80.0  |  72.5  |'
      expect(service.parseCoverage(stdout)).toBe(72.5)
    })
  })
})
