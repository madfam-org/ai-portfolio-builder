/**
 * W5-J SSRF guard: every rejection of net.ts (addresses, names) and fetcher.ts `checkUrl` (scheme, port, userinfo).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FetchError, checkUrl } from '../src/server/ingest/fetcher.ts';
import { hostProblem, isPublicAddress, parseIPv6 } from '../src/server/ingest/net.ts';

test('IPv4: private, loopback, link-local/metadata, CGNAT, multicast, reserved and documentation ranges are refused', () => {
  for (const ip of [
    '0.0.0.0', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.254', '127.0.0.1', '127.1.2.3', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.10', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255',
    '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '192.169.0.1', '95.217.1.1']) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test('IPv6: only global unicast; loopback, ULA (incl. fd00:ec2::254), link-local, multicast, NAT64, 6to4, Teredo, docs refused', () => {
  for (const ip of [
    '::', '::1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'fec0::1', 'ff02::1', '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1', '3fff::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254',
    '::127.0.0.1', '::ffff:7f00:1', '[::1]', 'fe80::1%eth0', '1::', 'not-an-ip',
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['2606:4700:4700::1111', '2a01:4f8:c0c:1234::1', '::ffff:8.8.8.8', '[2606:4700::6810:84e5]']) assert.equal(isPublicAddress(ip), true, ip);
  assert.deepEqual(parseIPv6('::ffff:1.2.3.4')!.slice(10), [0xff, 0xff, 1, 2, 3, 4]);
  assert.equal(parseIPv6('1:2:3:4:5:6:7:8:9'), null);
  assert.equal(parseIPv6('1::2::3'), null);
});

test('hostnames: localhost, single labels, cluster and special-use suffixes, bad labels and private literals are refused before DNS', () => {
  const cases: [string, string | null][] = [
    ['localhost', 'blocked_host'],
    ['LOCALHOST.', 'blocked_host'],
    ['intranet', 'blocked_host'],
    ['api.localhost', 'blocked_host'],
    ['printer.local', 'blocked_host'],
    ['metadata.google.internal', 'blocked_host'],
    ['cv.cv.svc.cluster.local', 'blocked_host'],
    ['pgbouncer.data.svc', 'blocked_host'],
    ['router.home.arpa', 'blocked_host'],
    ['empleos.example', 'blocked_host'],
    ['x.test', 'blocked_host'],
    ['1.0.0.127.in-addr.arpa', 'blocked_host'],
    ['bad_name.example.org', 'blocked_host'],
    ['a..b.org', 'blocked_host'],
    ['127.0.0.1', 'private_address'],
    ['[::1]', 'private_address'],
    ['[fd00::1]', 'private_address'],
    ['empleos.example.org', null],
    ['www.occ.com.mx', null],
    ['8.8.8.8', null],
  ];
  for (const [host, want] of cases) assert.equal(hostProblem(host), want, host);
});

test('checkUrl: https only, port 443 only, no userinfo, no garbage; the fragment is dropped', () => {
  const code = (raw: string) => {
    try {
      checkUrl(raw);
      return 'ok';
    } catch (err) {
      return err instanceof FetchError ? err.code : 'other';
    }
  };
  assert.equal(code('http://empleos.example.org/v/1'), 'not_https');
  assert.equal(code('ftp://empleos.example.org/v/1'), 'not_https');
  assert.equal(code('file:///etc/passwd'), 'not_https');
  assert.equal(code('javascript:alert(1)'), 'not_https');
  assert.equal(code('https://empleos.example.org:8443/v/1'), 'bad_port');
  assert.equal(code('https://empleos.example.org:80/v/1'), 'bad_port');
  assert.equal(code('https://user:pass@empleos.example.org/v/1'), 'credentials');
  assert.equal(code('https://token@empleos.example.org/v/1'), 'credentials');
  assert.equal(code('https://127.0.0.1/'), 'private_address');
  assert.equal(code('https://0x7f.1/'), 'private_address');
  assert.equal(code('https://2130706433/'), 'private_address');
  assert.equal(code('https://[::ffff:169.254.169.254]/latest/meta-data'), 'private_address');
  assert.equal(code('https://localhost/'), 'blocked_host');
  assert.equal(code('not a url'), 'invalid_url');
  assert.equal(code('https://empleos.example.org:443/v/1'), 'ok');
  assert.equal(checkUrl('https://empleos.example.org/v/1?a=1#frag').toString(), 'https://empleos.example.org/v/1?a=1');
});
