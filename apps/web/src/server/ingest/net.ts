/**
 * W5-J SSRF guard, part 1: which hosts and addresses the intake fetcher may ever connect to. Pure functions (no DNS,
 * no sockets) so every rejection is unit-tested (test/ingest-net.test.ts).
 *
 * The rule is an ALLOW-list of public unicast space, not a deny-list of known private ranges:
 * - IPv4: everything except 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (link-local, cloud metadata),
 *   172.16/12, 192.0.0/24, 192.0.2/24, 192.31.196/24, 192.52.193/24, 192.88.99/24 (6to4 relay), 192.168/16,
 *   192.175.48/24, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4 (multicast), 240/4 (reserved, broadcast).
 * - IPv6: ONLY 2000::/3 (global unicast), minus 2001::/23 (IETF special: Teredo, ORCHID, AS112 …), 2001:db8::/32 and
 *   3fff::/20 (documentation), 2002::/16 (6to4: it embeds an IPv4 address). So ::, ::1, fc00::/7 (ULA, including the
 *   fd00:ec2::254 metadata address), fe80::/10, ff00::/8 and 64:ff9b::/96 (NAT64) are all refused. IPv4-mapped
 *   (::ffff:a.b.c.d) and IPv4-compatible forms are judged as the IPv4 address they carry.
 */

const V4_BLOCKED: readonly [number, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([ip, bits]) => [v4ToInt(parseIPv4(ip as string)!), bits as number]);

function v4ToInt(o: readonly number[]): number {
  return ((o[0]! << 24) >>> 0) + (o[1]! << 16) + (o[2]! << 8) + o[3]!;
}

/** Dotted-quad only (four decimal octets, no leading zeros beyond "0"): the forms `inet_aton` also accepts are refused. */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** 16 bytes, or null. Accepts `::` compression and a dotted IPv4 tail; refuses zone ids (`%eth0`). */
export function parseIPv6(input: string): number[] | null {
  let s = input;
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (s.includes('%') || !s.includes(':')) return null;
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseIPv4(last);
    if (!v4) return null;
    tail = v4;
    s = `${s.slice(0, lastColon + 1)}0:0`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const words = (h: string) => (h === '' ? [] : h.split(':'));
  const head = words(halves[0]!);
  const rest = halves.length === 2 ? words(halves[1]!) : [];
  const total = head.length + rest.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;
  const groups = [...head, ...Array<string>(8 - total).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function isPublicV4(o: readonly number[]): boolean {
  const n = v4ToInt(o);
  return !V4_BLOCKED.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((net & mask) >>> 0);
  });
}

function isPublicV6(b: readonly number[]): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  // IPv4-mapped ::ffff:a.b.c.d and the deprecated IPv4-compatible ::a.b.c.d: judge the embedded IPv4 address.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPublicV4(b.slice(12));
  if (zeros(0, 12)) return false; // ::, ::1 and ::a.b.c.d
  if ((b[0]! & 0xe0) !== 0x20) return false; // outside 2000::/3
  if (b[0] === 0x20 && b[1] === 0x01 && (b[2]! & 0xfe) === 0x00) return false; // 2001::/23
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // 2001:db8::/32
  if (b[0] === 0x20 && b[1] === 0x02) return false; // 2002::/16
  if (b[0] === 0x3f && b[1] === 0xff && (b[2]! & 0xf0) === 0x00) return false; // 3fff::/20
  return true;
}

/** True only for a public unicast IPv4 or IPv6 address. Anything unparseable is false. */
export function isPublicAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicV4(v4);
  const v6 = parseIPv6(ip);
  return v6 ? isPublicV6(v6) : false;
}

/** Names that never point at the public web (or point inside the cluster), whatever DNS says. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa', '.svc', '.cluster.local', '.test', '.example', '.invalid', '.onion', '.arpa'];

export type HostProblem = 'blocked_host' | 'private_address';

/**
 * Checks a URL hostname BEFORE any DNS: single-label names, special-use suffixes and `localhost` are refused; an IP
 * literal must be public. Returns null when the name may be resolved (the resolved addresses are checked again).
 */
export function hostProblem(hostname: string): HostProblem | null {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h.startsWith('[') || parseIPv4(h) || parseIPv6(h)) return isPublicAddress(h) ? null : 'private_address';
  if (h === '' || h === 'localhost' || !h.includes('.')) return 'blocked_host';
  if (!/^[a-z0-9.-]+$/.test(h) || h.split('.').some((label) => label === '' || label.length > 63)) return 'blocked_host';
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return 'blocked_host';
  return null;
}
