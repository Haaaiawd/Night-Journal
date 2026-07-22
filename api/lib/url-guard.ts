import { isIP } from "net";
import { resolve4, resolve6 } from "dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

function ipToOctets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
  return octets;
}

function isPrivateIPv4(ip: string): boolean {
  const octets = ipToOctets(ip);
  if (!octets) return false;
  const [a, b] = octets;

  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local / cloud metadata
  if (a === 0) return true;                            // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;     // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  // IPv4-mapped (::ffff:x.x.x.x)
  const v4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) return isPrivateIPv4(v4Match[1]);
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.endsWith(".internal")) return true;

  if (isIP(lower) === 4) return isPrivateIPv4(lower);
  if (isIP(lower) === 6) return isPrivateIPv6(lower);

  // Bracket-stripped IPv6 (URL class strips brackets)
  const stripped = lower.replace(/^\[|\]$/g, "");
  if (isIP(stripped) === 6) return isPrivateIPv6(stripped);

  return false;
}

/**
 * Resolve a hostname to its IP addresses and return true if any resolved IP
 * belongs to a private/internal network. This is the SSRF/DNS rebinding guard:
 * an attacker-controlled domain may resolve to a public IP on the first check
 * and then to a private IP when the server performs the actual request.
 */
export async function isPrivateResolvedHost(hostname: string): Promise<boolean> {
  if (isPrivateHost(hostname)) return true;

  const records: string[] = [];
  try {
    records.push(...(await resolve4(hostname)));
  } catch {
    // ignore: no A records
  }
  try {
    records.push(...(await resolve6(hostname)));
  } catch {
    // ignore: no AAAA records
  }

  return records.some((ip) => isPrivateHost(ip));
}
