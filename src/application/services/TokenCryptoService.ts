import crypto from "crypto";
import {
  ITokenCryptoService,
  StreamTokenPayload,
} from "@/domain/interfaces/ITokenCryptoService";

/**
 * Error lanzado cuando un token de reproducción superó su tiempo de vida útil (`exp`).
 */
export class TokenExpiredError extends Error {
  constructor(message = "El token de reproducción ha expirado.") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

/**
 * Error lanzado cuando un token de reproducción tiene formato inválido o su firma GCM no coincide.
 */
export class InvalidTokenError extends Error {
  constructor(
    message = "El token de reproducción es inválido o fue alterado."
  ) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/**
 * Servicio de Cifrado Simétrico Autenticado (`AES-256-GCM`).
 *
 * Oculta la URL real del servidor de video ante el cliente y aplica expiración temporal
 * (por defecto 4 horas) para impedir el robo de enlaces (hotlinking).
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

    // Deriva siempre una clave exacta de 32 bytes (256 bits) mediante SHA-256
    this.secretKey = crypto.createHash("sha256").update(rawSecret).digest();

    const configuredHours =
      ttlHours ?? Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    this.ttlMs = Math.max(1, configuredHours) * 60 * 60 * 1000;
  }

  /**
   * Cifra y firma un payload de reproducción en un token compacto URL-safe (`iv.authTag.ciphertext`).
   *
   * @param payload Datos del mirror a proteger (sin el campo `exp`, que se calcula automáticamente).
   * @returns Token cifrado en formato `base64url`.
   */
  public encryptStreamToken(payload: Omit<StreamTokenPayload, "exp">): string {
    const fullPayload: StreamTokenPayload = {
      ...payload,
      exp: Date.now() + this.ttlMs,
    };

    const initializationVector = crypto.randomBytes(12); // 96 bits recomendados para AES-GCM
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.secretKey,
      initializationVector
    );

    const serializedPayload = JSON.stringify(fullPayload);
    const encryptedBytes = Buffer.concat([
      cipher.update(serializedPayload, "utf8"),
      cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();

    return [
      initializationVector.toString("base64url"),
      authenticationTag.toString("base64url"),
      encryptedBytes.toString("base64url"),
    ].join(".");
  }

  /**
   * Desencripta y verifica la autenticidad y vigencia temporal de un token de reproducción.
   *
   * @param token Token recibido en la ruta `/api/stream/[token]`.
   * @returns Payload desencriptado (`StreamTokenPayload`).
   * @throws `InvalidTokenError` si el token fue alterado o está malformado.
   * @throws `TokenExpiredError` si el token ya venció.
   */
  public decryptStreamToken(token: string): StreamTokenPayload {
    if (!token || typeof token !== "string") {
      throw new InvalidTokenError("Token vacío o malformado.");
    }

    const segments = token.split(".");
    if (segments.length !== 3) {
      throw new InvalidTokenError("Estructura de token inválida.");
    }

    try {
      const [ivBase64, authTagBase64, encryptedBase64] = segments;
      const initializationVector = Buffer.from(ivBase64, "base64url");
      const authenticationTag = Buffer.from(authTagBase64, "base64url");
      const encryptedBytes = Buffer.from(encryptedBase64, "base64url");

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.secretKey,
        initializationVector
      );
      decipher.setAuthTag(authenticationTag);

      const decryptedJson = Buffer.concat([
        decipher.update(encryptedBytes),
        decipher.final(),
      ]).toString("utf8");

      const payload = JSON.parse(decryptedJson) as StreamTokenPayload;

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

  /**
   * Devuelve el tiempo de vida útil configurado para los tokens en milisegundos.
   *
   * @returns Duración del TTL en milisegundos.
   */
  public getTtlMs(): number {
    return this.ttlMs;
  }
}
