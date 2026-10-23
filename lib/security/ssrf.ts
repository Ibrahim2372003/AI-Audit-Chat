import { isIP } from 'node:net';
import { SiteFetchError, SITE_FETCH_MESSAGES } from './site-fetch-error';

/**
 * Destination policy for user-supplied URLs (SSRF defence).
 *
 * This file is pure policy: no sockets, no DNS. It answers two questions:
 *   1. Is this URL acceptable to even try (scheme, credentials, port, host)?
 *   2. Is this IP address a public, routable destination?
 *
 * It is NOT sufficient on its own: a hostname can resolve to a private address
 * (or change its answer between a check and the connection). safe-fetch.ts
 * therefore applies question 2 to the address actually used for each
 * connection, at connect time. See that file for the DNS-rebinding notes.
 */

/** Only the standard web ports. Blocks probing of internal services on odd ports. */
export const DEFAULT_ALLOWED_PORTS: readonly number[] = [80, 443];

export type DestinationPolicy = {
  allowedPorts: readonly number[];
  isPublicAddress: (address: string) => boolean;
};

export const DEFAULT_POLICY: DestinationPolicy = {
  allowedPorts: DEFAULT_ALLOWED_PORTS,
  isPublicAddress,
};

// ---- IP parsing ----------------------------------------------------------------

/** Strict dotted-quad. Leading zeros are rejected (octal/decimal ambiguity). */
export function parseIPv4(input: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(input)) return null;
  const parts = input.split('.');
  const bytes: number[] = [];
  for (const part of parts) {
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

/** Parses any textual IPv6 form (incl. "::" compression and embedded IPv4) to 16 bytes. */
export function parseIPv6(input: string): number[] | null {
  if (input.includes('%')) return null; // zone ids are never legitimate here
  let text = input;

  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    if (head.length + tail.length > 7) return null;
    groups = [...head, ...new Array<string>(8 - head.length - tail.length).fill('0'), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

// ---- address classification ------------------------------------------------------

function inCidr4(b: number[], base: number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < 4 && remaining > 0; i += 1) {
    const take = Math.min(8, remaining);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((b[i] & mask) !== (base[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

const BLOCKED_IPV4: ReadonlyArray<[number[], number]> = [
  [[0, 0, 0, 0], 8], // "this network", incl. 0.0.0.0
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, incl. cloud metadata 169.254.169.254
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 88, 99, 0], 24], // 6to4 relay anycast (deprecated)
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, incl. 255.255.255.255
];

export function isPublicIPv4(bytes: number[]): boolean {
  if (bytes.length !== 4) return false;
  return !BLOCKED_IPV4.some(([base, bits]) => inCidr4(bytes, base, bits));
}

export function isPublicIPv6(b: number[]): boolean {
  if (b.length !== 16) return false;
  const v4 = (offset: number) => b.slice(offset, offset + 4);
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);

  // IPv4-mapped (::ffff:a.b.c.d): judged by the embedded IPv4 address.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPublicIPv4(v4(12));
  // NAT64 well-known prefix (64:ff9b::/96): judged by the embedded IPv4 address.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) {
    return isPublicIPv4(v4(12));
  }

  // Allowlist: only global unicast 2000::/3 can be public. This excludes ::, ::1,
  // IPv4-compatible ::/96, fc00::/7 (ULA), fe80::/10 (link-local), fec0::/10,
  // ff00::/8 (multicast) and every other reserved range in one rule.
  if ((b[0] & 0xe0) !== 0x20) return false;

  // Carve-outs inside 2000::/3.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return false; // Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // documentation
  if (b[0] === 0x3f && b[1] === 0xff && (b[2] & 0xf0) === 0x00) return false; // documentation (3fff::/20)
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicIPv4(v4(2)); // 6to4: judged by embedded IPv4
  // Benchmarking: 2001:2::/48
  if (
    b[0] === 0x20 &&
    b[1] === 0x01 &&
    b[2] === 0x00 &&
    b[3] === 0x02 &&
    b[4] === 0x00 &&
    b[5] === 0x00
  ) return false;

  // Deprecated ORCHID: 2001:10::/28
  if (
    b[0] === 0x20 &&
    b[1] === 0x01 &&
    b[2] === 0x00 &&
    (b[3] & 0xf0) === 0x10
  ) return false;
  return true;
}

/** True only for a parseable, public, routable IP literal. Unparseable input is NOT public. */
export function isPublicAddress(address: string): boolean {
  const bare = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const family = isIP(bare);
  if (family === 4) {
    const bytes = parseIPv4(bare);
    return bytes ? isPublicIPv4(bytes) : false;
  }
  if (family === 6) {
    const bytes = parseIPv6(bare);
    return bytes ? isPublicIPv6(bytes) : false;
  }
  return false;
}

// ---- hostname and URL policy -----------------------------------------------------

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.home.arpa'];

/** Name-level checks for non-IP hosts. DNS-level checks happen at connect time. */
export function hostnameBlockReason(rawHost: string): string | null {
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (!host) return 'empty host';
  if (host === 'localhost') return 'localhost';
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'internal suffix';
  if (!host.includes('.')) return 'single-label host';
  return null;
}

function blocked(detail: string): SiteFetchError {
  return new SiteFetchError('blocked_destination', SITE_FETCH_MESSAGES.blocked_destination, detail);
}

function invalid(detail: string): SiteFetchError {
  return new SiteFetchError('invalid_url', SITE_FETCH_MESSAGES.invalid_url, detail);
}

/**
 * Validates scheme, credentials, port and host (name or IP literal). Throws a
 * typed SiteFetchError; returns the parsed URL on success. Call it on the
 * initial URL AND on every redirect target.
 *
 * Note: the WHATWG URL parser already normalises exotic IPv4 spellings
 * (decimal `2130706433`, hex `0x7f.1`, short `127.1`) to dotted form, so
 * those reach the IP check below as ordinary loopback addresses.
 */
export function assertAllowedUrl(
  raw: string | URL,
  policy: DestinationPolicy = DEFAULT_POLICY,
): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw invalid('unparseable url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalid(`scheme ${url.protocol}`);
  }
  if (url.username || url.password) throw invalid('credentials in url');

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!policy.allowedPorts.includes(port)) throw blocked('port not allowed');

  const host =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;

  if (isIP(host)) {
    if (!policy.isPublicAddress(host)) throw blocked('non-public ip literal');
  } else {
    const reason = hostnameBlockReason(host);
    if (reason) throw blocked(`hostname: ${reason}`);
  }
  return url;
}
