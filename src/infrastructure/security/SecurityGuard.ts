import crypto from "crypto";

export interface ExternalReferencePayload {
  userId: string;
  userEmail: string;
  userName?: string | null;
  billingCycle: string;
}

export interface VerifiedExternalReference {
  valid: boolean;
  userId?: string;
  userEmail?: string;
  userName?: string | null;
  billingCycle?: string;
}

const BLOCKED_EXACT_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "::",
  "0:0:0:0:0:0:0:1",
  "0:0:0:0:0:0:0:0",
  "metadata",
  "metadata.google.internal",
  "169.254.169.254",
  "fd00:ec2::254",
]);

function isPrivateOrReservedIpv4Octets(
  a: number,
  b: number,
  c: number,
  d: number
): boolean {
  if (
    [a, b, c, d].some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
    )
  ) {
    return true;
  }

  // 0.0.0.0/8 (This network), 10.0.0.0/8 (RFC1918), 127.0.0.0/8 (Loopback)
  if (a === 0 || a === 10 || a === 127) return true;
  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (Link-local & cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (RFC1918)
  if (a === 192 && b === 168) return true;
  // 192.0.0.0/24 & 192.0.2.0/24 (IETF / TEST-NET-1)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // Multicast (224.0.0.0/4) and reserved (240.0.0.0/4)
  if (a >= 224) return true;

  return false;
}

function isBlockedIpAddress(normalizedHost: string): boolean {
  const ipv4Match = normalizedHost.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    return isPrivateOrReservedIpv4Octets(
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4])
    );
  }

  if (!normalizedHost.includes(":")) {
    return false;
  }

  // IPv6 loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10)
  if (
    normalizedHost === "::1" ||
    normalizedHost === "::" ||
    normalizedHost === "0:0:0:0:0:0:0:1" ||
    normalizedHost === "0:0:0:0:0:0:0:0" ||
    /^f[cd][0-9a-f]{0,2}:/.test(normalizedHost) ||
    /^fe[89ab][0-9a-f]:/.test(normalizedHost)
  ) {
    return true;
  }

  // IPv4-mapped IPv6 in dotted (::ffff:127.0.0.1) or Node normalized hex (::ffff:7f00:1) form
  const mappedDottedMatch = normalizedHost.match(
    /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (mappedDottedMatch) {
    return isPrivateOrReservedIpv4Octets(
      Number(mappedDottedMatch[1]),
      Number(mappedDottedMatch[2]),
      Number(mappedDottedMatch[3]),
      Number(mappedDottedMatch[4])
    );
  }

  const mappedHexMatch = normalizedHost.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (mappedHexMatch) {
    const hi = parseInt(mappedHexMatch[1], 16);
    const lo = parseInt(mappedHexMatch[2], 16);
    return isPrivateOrReservedIpv4Octets(
      (hi >> 8) & 0xff,
      hi & 0xff,
      (lo >> 8) & 0xff,
      lo & 0xff
    );
  }

  return false;
}

/**
 * Valida que una URL sea HTTP/HTTPS pública y segura (previene ataques SSRF a localhost,
 * redes privadas RFC1918 o endpoints de metadatos cloud).
 */
export function isSafePublicHttpUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  const normalizedHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalizedHost) {
    return false;
  }

  if (
    BLOCKED_EXACT_HOSTS.has(normalizedHost) ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost.endsWith(".local") ||
    normalizedHost.endsWith(".internal") ||
    normalizedHost.endsWith(".home.arpa")
  ) {
    return false;
  }

  if (isBlockedIpAddress(normalizedHost)) {
    return false;
  }

  return true;
}

/**
 * Compara dos secretos en tiempo constante mediante SHA-256 + `crypto.timingSafeEqual`
 * para evitar ataques de temporización (timing side-channel).
 */
export function safeCompareSecrets(provided: string, expected: string): boolean {
  if (
    typeof provided !== "string" ||
    typeof expected !== "string" ||
    !provided ||
    !expected
  ) {
    return false;
  }

  const digestA = crypto.createHash("sha256").update(provided, "utf8").digest();
  const digestB = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function getExternalReferenceHmacSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.STREAM_TOKEN_SECRET?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    ""
  );
}

function computeExternalReferenceSignature(
  secret: string,
  userId: string,
  userEmail: string,
  billingCycle: string
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}|${userEmail}|${billingCycle}`, "utf8")
    .digest("hex");
}

/**
 * Serializa y firma con HMAC-SHA256 el `external_reference` enviado a MercadoPago
 * para evitar que un atacante suplante otro `userId` al confirmar el pago.
 */
export function signExternalReference(
  payload: ExternalReferencePayload
): string {
  const secret = getExternalReferenceHmacSecret();
  if (!secret) {
    throw new Error(
      "Falta configurar NEXTAUTH_SECRET o MERCADOPAGO_ACCESS_TOKEN para firmar pagos."
    );
  }

  const sig = computeExternalReferenceSignature(
    secret,
    payload.userId,
    payload.userEmail,
    payload.billingCycle
  );

  return JSON.stringify({
    userId: payload.userId,
    userEmail: payload.userEmail,
    userName: payload.userName ?? null,
    billingCycle: payload.billingCycle,
    sig,
  });
}

/**
 * Verifica la firma HMAC-SHA256 de `external_reference` devuelto por MercadoPago.
 */
export function verifyExternalReference(
  rawRef: string | null | undefined
): VerifiedExternalReference {
  if (!rawRef || typeof rawRef !== "string") {
    return { valid: false };
  }

  const secret = getExternalReferenceHmacSecret();
  if (!secret) {
    return { valid: false };
  }

  let parsed: Partial<ExternalReferencePayload & { sig?: string }>;
  try {
    parsed = JSON.parse(rawRef.trim()) as Partial<
      ExternalReferencePayload & { sig?: string }
    >;
  } catch {
    return { valid: false };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.userId !== "string" ||
    !parsed.userId.trim() ||
    typeof parsed.billingCycle !== "string" ||
    typeof parsed.sig !== "string" ||
    !parsed.sig.trim()
  ) {
    return { valid: false };
  }

  const expectedSig = computeExternalReferenceSignature(
    secret,
    parsed.userId,
    typeof parsed.userEmail === "string" ? parsed.userEmail : "",
    parsed.billingCycle
  );

  if (!safeCompareSecrets(parsed.sig, expectedSig)) {
    return { valid: false };
  }

  return {
    valid: true,
    userId: parsed.userId,
    userEmail: typeof parsed.userEmail === "string" ? parsed.userEmail : undefined,
    userName: parsed.userName ?? null,
    billingCycle: parsed.billingCycle,
  };
}

/**
 * Verifica que las mutaciones (`POST`) originadas desde navegador provengan del mismo host
 * de la aplicación para mitigar ataques Cross-Site Request Forgery (CSRF).
 */
export function isSameOriginMutation(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(originHeader).host.toLowerCase();
  } catch {
    return false;
  }

  const allowedHosts = new Set<string>(["cine-ddbt.vercel.app"]);

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedHost) {
    allowedHosts.add(forwardedHost);
  }

  const hostHeader = request.headers
    .get("host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (hostHeader) {
    allowedHosts.add(hostHeader);
  }

  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) {
    try {
      allowedHosts.add(new URL(nextAuthUrl).host.toLowerCase());
    } catch {
      // Ignora si NEXTAUTH_URL no es válida
    }
  }

  return allowedHosts.has(originHost);
}

