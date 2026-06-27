// Phase 3: SSRF guard for the server-side product-page fetcher.
import { describe, expect, it } from 'vitest'
import { isPrivateHost, validateFetchTarget } from './urlGuard'

describe('isPrivateHost', () => {
  it('flags loopback, private, and link-local hosts', () => {
    for (const h of [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
      'fd00::1',
      'fe80::1',
      'svc.internal',
      'printer.local',
    ]) {
      expect(isPrivateHost(h)).toBe(true)
    }
  })

  it('allows ordinary public hosts', () => {
    for (const h of ['shop.example', 'www.acme.com', '8.8.8.8', '172.32.0.1']) {
      expect(isPrivateHost(h)).toBe(false)
    }
  })
})

describe('validateFetchTarget', () => {
  it('accepts and normalizes a public http(s) URL', () => {
    expect(validateFetchTarget('https://shop.example/p/1')).toEqual({
      ok: true,
      url: 'https://shop.example/p/1',
    })
  })

  it('rejects non-http(s) protocols', () => {
    expect(validateFetchTarget('ftp://shop.example').ok).toBe(false)
    expect(validateFetchTarget('file:///etc/passwd').ok).toBe(false)
    expect(validateFetchTarget('not a url').ok).toBe(false)
  })

  it('rejects private / internal hosts', () => {
    expect(validateFetchTarget('http://localhost:8000/x').ok).toBe(false)
    expect(validateFetchTarget('http://169.254.169.254/latest').ok).toBe(false)
    expect(validateFetchTarget('http://192.168.0.1/admin').ok).toBe(false)
  })
})
