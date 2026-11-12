import { MirrorFormat } from "../enums/MirrorFormat";

export interface StreamTokenPayload {
  mirrorId: string;
  movieId: string;
  rawUrl: string;
  format: MirrorFormat;
  serverName?: string;
  isStreamwish?: boolean;
  isDirty?: boolean;
  exp: number; // Timestamp en milisegundos
}

export interface ITokenCryptoService {
  encryptStreamToken(payload: Omit<StreamTokenPayload, "exp">): string;
  decryptStreamToken(token: string): StreamTokenPayload;
}
