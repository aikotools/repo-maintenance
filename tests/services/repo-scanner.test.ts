import { describe, it, expect } from 'vitest'
import { RepoScanner } from '../../src/server/services/repo-scanner'

describe('RepoScanner', () => {
  describe('detectRepoType', () => {
    const scanner = new RepoScanner('/tmp', ['@xhubio-saas'])

    it('should detect kernel', () => {
      expect(scanner.detectRepoType('@xhubio-saas/kernel', 'kernel')).toBe('kernel')
    })

    it('should detect frontend-kernel', () => {
      expect(scanner.detectRepoType('@xhubio-saas/frontend-kernel', 'frontend-kernel')).toBe(
        'frontend-kernel'
      )
    })

    it('should detect kernel-plugin', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/kernel-plugin-invoice', 'kernel-plugin-invoice')
      ).toBe('kernel-plugin')
    })

    it('should detect frontend-plugin', () => {
      expect(
        scanner.detectRepoType(
          '@xhubio-saas/frontend-plugin-customer',
          'frontend-plugin-customer'
        )
      ).toBe('frontend-plugin')
    })

    it('should detect frontend-ui from prefix', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/frontend-ui-forms', 'frontend-ui-forms')
      ).toBe('frontend-ui')
    })

    it('should detect frontend-ui-components', () => {
      expect(
        scanner.detectRepoType(
          '@xhubio-saas/frontend-ui-components',
          'frontend-ui-components'
        )
      ).toBe('frontend-ui')
    })

    it('should detect frontend-app as frontend-ui', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/frontend-app-template', 'frontend-app-template')
      ).toBe('frontend-ui')
    })

    it('should detect lib', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/lib-invoice-interface', 'lib-invoice-interface')
      ).toBe('lib')
    })

    it('should detect app', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/saas-invoice-backend', 'saas-invoice-backend')
      ).toBe('app')
    })

    it('should detect tool', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/tool-repo-maintenance', 'tool-repo-maintenance')
      ).toBe('tool')
    })

    it('should detect mock', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/mock-dev-services', 'mock-dev-services')
      ).toBe('mock')
    })

    it('should detect integration from xhub- in dirName', () => {
      expect(
        scanner.detectRepoType('@xhubio-saas/n8n-integration', 'invoice-api.xhub-n8n')
      ).toBe('integration')
    })

    it('should default to lib for unknown names', () => {
      expect(scanner.detectRepoType('@xhubio-saas/something-else', 'something-else')).toBe(
        'lib'
      )
    })

    it('should strip org prefix when detecting type', () => {
      expect(scanner.detectRepoType('@other-org/kernel', 'kernel')).toBe('kernel')
      expect(scanner.detectRepoType('@other-org/lib-foo', 'lib-foo')).toBe('lib')
    })
  })
})
