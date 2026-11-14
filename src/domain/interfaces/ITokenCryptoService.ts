import { MirrorFormat } from "../enums/MirrorFormat";

/**
 * Payload cifrado dentro de cada token temporal de reproducción (`AES-256-GCM`).
 */
export interface StreamTokenPayload {
  mirrorId: string;
  movieId: string;
  episodeId?: string;
  rawUrl: string;
  format: MirrorFormat;
  serverName?: string;
  isStreamwish?: boolean;
  isDirty?: boolean;
  exp: number; // Timestamp de expiración en milisegundos
}

/**
 * Contrato de servicio criptográfico para emitir y desencriptar tokens de reproducción.
 */
export interface ITokenCryptoService {
  encryptStreamToken(payload: Omit<StreamTokenPayload, "exp">): string;
  decryptStreamToken(token: string): StreamTokenPayload;
}
