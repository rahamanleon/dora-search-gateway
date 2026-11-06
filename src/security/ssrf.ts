import dns from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Checks if an IPv4 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP treated as unsafe
  }

  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT / Shared)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Metadata like AWS/GCP 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved: 240.0.0.0 - 255.255.255.254)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback (::1)
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unspecified (::)
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (ipv4Part.includes('.')) {
      return isPrivateIPv4(ipv4Part);
    }
    // Handle hex format
    const hexParts = ipv4Part.split(':');
    if (hexParts.length === 2 && hexParts[0] && hexParts[1]) {
      const p1 = Number.parseInt(hexParts[0], 16);
      const p2 = Number.parseInt(hexParts[1], 16);
      const reconstructed = `${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`;
      return isPrivateIPv4(reconstructed);
    }
    return true;
  }

  // Unique Local Addresses (fc00::/7 -> fc00:: to fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-Local (fe80::/10 -> fe80:: to febf::)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith('ff')) return true;

  return false;
}

export function isPrivateIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Unknown IP formats are treated as unsafe
}

export interface SSRFValidationResult {
  isValid: boolean;
  resolvedIp?: string;
  error?: string;
  url?: URL;
}

/**
 * Validates a URL against SSRF attacks:
 * 1. Valid protocol (http or https only)
 * 2. No userinfo (http://user:pass@host)
 * 3. Valid hostname (no localhost, invalid symbols)
 * 4. DNS resolution to public IP only (no private ranges, no loopback)
 * 5. DNS rebinding prevention via direct IP resolution check
 */
export async function validateUrlForSSRF(
  urlString: string,
  options: { allowLocalhost?: boolean } = {}
): Promise<SSRFValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP/HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: `Unsupported protocol: ${parsed.protocol}. Only http: and https: are allowed.`,
    };
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: 'URLs containing credentials are not allowed.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost names explicitly
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    if (!options.allowLocalhost) {
      return {
        isValid: false,
        error: `Host '${hostname}' is a local or internal domain.`,
      };
    }
  }

  // If hostname is directly an IP address
  const directIpType = isIP(hostname);
  if (directIpType !== 0) {
    if (isPrivateIP(hostname) && !options.allowLocalhost) {
      return {
        isValid: false,
        error: `IP '${hostname}' belongs to a private or restricted range.`,
      };
    }
    return {
      isValid: true,
      resolvedIp: hostname,
      url: parsed,
    };
  }

  // DNS resolution to verify all resolved IPs
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return {
        isValid: false,
        error: `DNS resolution failed for host: ${hostname}`,
      };
    }

    for (const record of addresses) {
      if (isPrivateIP(record.address) && !options.allowLocalhost) {
        return {
          isValid: false,
          resolvedIp: record.address,
          error: `Host '${hostname}' resolved to private/restricted IP: ${record.address}`,
        };
      }
    }

    return {
      isValid: true,
      resolvedIp: addresses[0]?.address,
      url: parsed,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      error: `DNS lookup failed for '${hostname}': ${msg}`,
    };
  }
}

