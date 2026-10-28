import crypto from "crypto";
import {
  ITokenCryptoService,
  StreamTokenPayload,
} from "@/domain/interfaces/ITokenCryptoService";

export class TokenExpiredError extends Error {
  constructor(message = "El token de reproducción ha expirado.") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export class InvalidTokenError extends Error {
  constructor(message = "El token de reproducción es inválido o fue alterado.") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/**
 * Servicio de Cifrado Simétrico Autenticado (AES-256-GCM).
 * Oculta la URL real del servidor de video y aplica expiración temporal (por defecto 4 horas).
 */
export class TokenCryptoService implements ITokenCryptoService {
  private readonly algorithm = "aes-256-gcm";
  private readonly secretKey: Buffer;
  private readonly ttlMs: number;

  constructor(secretPhrase?: string, ttlHours?: number) {
    const rawSecret =
      secretPhrase ||
      process.env.STREAM_TOKEN_SECRET ||
      "default_dev_secret_piloto_streaming_2026_aes256gcm";

    // Derivamos siempre una clave exacta de 32 bytes (256 bits) mediante SHA-256
    this.secretKey = crypto.createHash("sha256").update(rawSecret).digest();

    const hours =
      ttlHours ?? Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    this.ttlMs = Math.max(1, hours) * 60 * 60 * 1000;
  }

  public encryptStreamToken(payload: Omit<StreamTokenPayload, "exp">): string {
    const fullPayload: StreamTokenPayload = {
      ...payload,
      exp: Date.now() + this.ttlMs,
    };

    const iv = crypto.randomBytes(12); // 96 bits recomendados para GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);

    const jsonPlain = JSON.stringify(fullPayload);
    const encrypted = Buffer.concat([
      cipher.update(jsonPlain, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Formato compacto URL-safe: iv.authTag.ciphertext
    return [
      iv.toString("base64url"),
      authTag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  public decryptStreamToken(token: string): StreamTokenPayload {
    if (!token || typeof token !== "string") {
      throw new InvalidTokenError("Token vacío o malformado.");
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new InvalidTokenError("Estructura de token inválida.");
    }

    try {
      const [ivB64, authTagB64, encryptedB64] = parts;
      const iv = Buffer.from(ivB64, "base64url");
      const authTag = Buffer.from(authTagB64, "base64url");
      const encryptedText = Buffer.from(encryptedB64, "base64url");

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.secretKey,
        iv
      );
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
      ]).toString("utf8");

      const payload = JSON.parse(decrypted) as StreamTokenPayload;

      if (!payload.exp || Date.now() > payload.exp) {
        throw new TokenExpiredError();
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw error;
      }
      throw new InvalidTokenError();
    }
  }

  public getTtlMs(): number {
    return this.ttlMs;
  }
}
