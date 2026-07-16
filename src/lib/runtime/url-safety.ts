import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { InvocationValidationError } from "./errors";

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export async function validatePublicHttpUrl(value: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvocationValidationError("请输入有效的 HTTP 或 HTTPS URL。");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new InvocationValidationError("只允许 HTTP 和 HTTPS URL。");
  }
  if (parsed.username || parsed.password) {
    throw new InvocationValidationError("URL 不能包含用户名或密码。");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new InvocationValidationError("不允许访问本机或局域网主机名。");
  }

  const literalFamily = isIP(hostname);
  if (literalFamily && isBlockedAddress(hostname)) {
    throw new InvocationValidationError("不允许访问私有、回环、链路本地或保留地址。");
  }

  if (!literalFamily) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new InvocationValidationError("域名无法解析。");
    }
    if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address))) {
      throw new InvocationValidationError("域名解析到了私有、回环、链路本地或保留地址。");
    }
  }

  parsed.hash = "";
  return parsed.toString();
}

