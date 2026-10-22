import { describe, expect, it } from 'vitest';
import {
  assertAllowedUrl,
  hostnameBlockReason,
  isPublicAddress,
  parseIPv4,
  parseIPv6,
} from '../ssrf';

function thrown(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('isPublicAddress: addresses that must be blocked', () => {
  it.each([
    // IPv4: loopback, private, link-local (cloud metadata), CGNAT, special-use
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    '169.254.169.254',
    '169.254.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '0.0.0.0',
    '0.1.2.3',
    '192.0.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    // IPv6: loopback, unspecified, link-local, ULA, multicast
    '::1',
    '::',
    'fe80::1',
    'febf::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    // IPv6 forms that smuggle an IPv4 address
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '64:ff9b::a00:1',
    '2002:7f00:1::1',
    '2002:0a00:0001::1',
    // IPv6 reserved
    '2001:db8::1',
    '2001::1',
    '3fff::1',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '',
    'garbage',
    'localhost',
    '1.2.3',
    '1.2.3.4.5',
    '256.1.1.1',
    '010.0.0.1',
    '1.2.3.04',
    'fe80::1%eth0',
    ':::',
    '1::2::3',
    'gggg::1',
  ])('treats unparseable input %j as non-public (fails closed)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('isPublicAddress: addresses that must be allowed', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '192.167.255.255',
    '192.169.0.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:0808:0808::1',
    '[2606:4700:4700::1111]',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('IP parsers', () => {
  it('parses dotted-quad and rejects ambiguous forms', () => {
    expect(parseIPv4('1.2.3.4')).toEqual([1, 2, 3, 4]);
    expect(parseIPv4('01.2.3.4')).toBeNull();
    expect(parseIPv4('1.2.3')).toBeNull();
  });

  it('expands :: compression and embedded IPv4', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 1, 2, 3, 4]);
    expect(parseIPv6('1:2:3:4:5:6:7:8')).toHaveLength(16);
    expect(parseIPv6('1:2:3:4:5:6:7')).toBeNull();
  });
});

describe('hostnameBlockReason', () => {
  it.each([
    'localhost',
    'LOCALHOST.',
    'api.localhost',
    'printer.local',
    'db.internal',
    'host.localdomain',
    'router.home.arpa',
    'intranet',
    '',
  ])('blocks %j', (host) => {
    expect(hostnameBlockReason(host)).not.toBeNull();
  });

  it('allows ordinary public names', () => {
    expect(hostnameBlockReason('example.com')).toBeNull();
    expect(hostnameBlockReason('Example.COM.')).toBeNull();
    expect(hostnameBlockReason('sub.domain.example.co.uk')).toBeNull();
  });
});

describe('assertAllowedUrl', () => {
  it.each([
    ['not a url', 'invalid_url'],
    ['', 'invalid_url'],
    ['ftp://example.com/', 'invalid_url'],
    ['file:///etc/passwd', 'invalid_url'],
    ['javascript:alert(1)', 'invalid_url'],
    ['gopher://example.com/', 'invalid_url'],
    ['http://user:pw@example.com/', 'invalid_url'],
    ['https://user@example.com/', 'invalid_url'],
  ])('rejects %j as %s', (raw, code) => {
    const error = thrown(() => assertAllowedUrl(raw));
    expect(error.siteFetchCode).toBe(code);
  });

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://foo.localhost/',
    'http://printer.local/',
    'http://service.internal/',
    'http://intranet/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/', // decimal form of 127.0.0.1
    'http://0x7f.1/', // hex form
    'http://0177.0.0.1/', // octal form
    'http://0.0.0.0/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
    'http://example.com:8080/',
    'https://example.com:22/',
    'http://example.com:6379/',
  ])('blocks %s', (raw) => {
    const error = thrown(() => assertAllowedUrl(raw));
    expect(error.siteFetchCode).toBe('blocked_destination');
  });

  it.each([
    'https://example.com/',
    'http://example.com:80/',
    'https://example.com:443/path?q=1#frag',
    'https://[2606:4700:4700::1111]/',
    'https://8.8.8.8/',
    'http://sub.example.co.uk/a/b',
  ])('allows %s', (raw) => {
    expect(assertAllowedUrl(raw)).toBeInstanceOf(URL);
  });

  it('never puts the address or URL in the user-facing message', () => {
    const error = thrown(() => assertAllowedUrl('http://169.254.169.254/latest/meta-data/'));
    expect(error.message).not.toMatch(/169\.254/);
    expect(error.message).not.toMatch(/meta-data/);
    // The diagnostic detail is for server logs only.
    expect(error.detail).toBe('non-public ip literal');
  });
});
