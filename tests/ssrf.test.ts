import { describe, it, expect } from 'vitest';
import { isPrivateIPv4, isPrivateIPv6, isPrivateIP, validateUrlForSSRF } from '../src/security/ssrf.js';

describe('SSRF Protection (Scenario 8)', () => {
  describe('IPv4 Private Ranges', () => {
    it('detects loopback addresses', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateIPv4('127.1.2.3')).toBe(true);
    });

    it('detects RFC 1918 private addresses', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('10.255.255.254')).toBe(true);
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateIPv4('192.168.0.254')).toBe(true);
    });

    it('detects AWS/GCP cloud metadata address (169.254.169.254)', () => {
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateIPv4('169.254.1.1')).toBe(true);
    });

    it('detects CGNAT and broadcast', () => {
      expect(isPrivateIPv4('100.64.0.1')).toBe(true);
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateIPv4('255.255.255.255')).toBe(true);
    });

    it('allows public IPv4 addresses', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('142.250.190.46')).toBe(false);
    });
  });

  describe('IPv6 Private Ranges', () => {
    it('detects loopback and unspecified', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('::')).toBe(true);
    });

    it('detects IPv4-mapped IPv6 loopback / private', () => {
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:169.254.169.254')).toBe(true);
    });

    it('detects ULA and link-local', () => {
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateIPv6('fe80::1')).toBe(true);
    });

    it('allows public IPv6 addresses', () => {
      expect(isPrivateIPv6('2607:f8b0:4005:805::200e')).toBe(false);
      expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('validateUrlForSSRF', () => {
    it('rejects invalid or non-http protocols (file:, ftp:, gopher:)', async () => {
      const fileRes = await validateUrlForSSRF('file:///etc/passwd');
      expect(fileRes.isValid).toBe(false);
      expect(fileRes.error).toContain('Unsupported protocol');

      const gopherRes = await validateUrlForSSRF('gopher://127.0.0.1:70');
      expect(gopherRes.isValid).toBe(false);

      const jsRes = await validateUrlForSSRF('javascript:alert(1)');
      expect(jsRes.isValid).toBe(false);
    });

    it('rejects URLs containing embedded credentials', async () => {
      const res = await validateUrlForSSRF('http://admin:secret@example.com/api');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('credentials');
    });

    it('rejects localhost hostnames', async () => {
      const res1 = await validateUrlForSSRF('http://localhost:8080/search');
      expect(res1.isValid).toBe(false);

      const res2 = await validateUrlForSSRF('http://service.local/');
      expect(res2.isValid).toBe(false);

      const res3 = await validateUrlForSSRF('http://myapp.internal/secret');
      expect(res3.isValid).toBe(false);
    });

    it('rejects direct private IPs in URL', async () => {
      const res = await validateUrlForSSRF('http://169.254.169.254/computeMetadata/v1/');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('private or restricted');
    });
  });
});

