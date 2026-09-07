// Phase 3: SSRF guard for the server-side product-page fetcher.
import { describe, expect, it } from 'vitest'
import { isPrivateHost, parseIpv6, validateFetchTarget } from './urlGuard'

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

// --- Bypasses that a text-matching guard misses -----------------------------
//
// Every case below defeated the previous implementation. They are grouped
// separately from the happy path because they are the reason this module is
// more than four lines long.

describe('isPrivateHost — encoded and aliased forms of a private address', () => {
  it('blocks IPv4-mapped IPv6, the form WHATWG URL actually produces', () => {
    // `new URL('http://[::ffff:127.0.0.1]/').hostname` is '[::ffff:7f00:1]'.
    // A prefix check for 'fc'/'fd'/'fe80' never saw it.
    for (const h of [
      '[::ffff:7f00:1]',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateHost(h)).toBe(true)
    }
  })

  it('blocks the unspecified address and IPv4-compatible IPv6', () => {
    for (const h of ['[::]', '::', '::1', '[::1]', '::127.0.0.1']) {
      expect(isPrivateHost(h)).toBe(true)
    }
  })

  it('blocks integer-encoded IPv4', () => {
    expect(isPrivateHost('2130706433')).toBe(true) // 127.0.0.1
    expect(isPrivateHost('0')).toBe(true)
    // A number too large to be an address is not a host worth fetching either.
    expect(isPrivateHost('99999999999999999999')).toBe(true)
  })

  it('blocks ranges that are routable inside a hosting network', () => {
    expect(isPrivateHost('100.64.0.1')).toBe(true) // RFC 6598 CGNAT
    expect(isPrivateHost('100.127.255.255')).toBe(true)
    expect(isPrivateHost('192.0.0.1')).toBe(true) // IETF protocol assignments
    expect(isPrivateHost('198.18.0.1')).toBe(true) // benchmarking
    expect(isPrivateHost('224.0.0.1')).toBe(true) // multicast
    expect(isPrivateHost('255.255.255.255')).toBe(true) // broadcast
  })

  it('blocks internal DNS suffixes', () => {
    for (const h of ['db.home.arpa', 'wiki.intranet', 'api.internal']) {
      expect(isPrivateHost(h)).toBe(true)
    }
  })

  it('does NOT block public hosts that merely start like a private range', () => {
    // The previous guard blocked every hostname beginning 'fc', 'fd' or 'fe80'.
    for (const h of [
      'fdny.gov',
      'fc-barcelona.example',
      'fe80shop.example',
      'local-hero.example',
      '100.63.255.255',
      '100.128.0.1',
      '192.1.0.1',
      '198.20.0.1',
      '223.255.255.255',
    ]) {
      expect(isPrivateHost(h)).toBe(false)
    }
  })
})

describe('parseIpv6', () => {
  it('expands compressed and IPv4-suffixed forms', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x7f00, 1,
    ])
    expect(parseIpv6('2606:4700:0:0:0:0:0:1111')).toEqual([
      0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111,
    ])
  })

  it('rejects malformed literals rather than guessing', () => {
    expect(parseIpv6('1::2::3')).toBeNull()
    expect(parseIpv6('gggg::1')).toBeNull()
    expect(parseIpv6('1:2:3:4:5:6:7')).toBeNull()
    expect(parseIpv6('example.com')).toBeNull()
  })
})

describe('validateFetchTarget — credentials', () => {
  it('rejects a URL carrying credentials', () => {
    // `http://shop.example@127.0.0.1/` reads as public to a human and resolves
    // to loopback. Refusing credentials outright removes the whole class.
    const result = validateFetchTarget('http://shop.example@93.184.216.34/p')
    expect(result.ok).toBe(false)
    expect(validateFetchTarget('https://user:pw@shop.example/p').ok).toBe(false)
  })
})
