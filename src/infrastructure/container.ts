import { prisma } from "./database/prismaClient";
import { PrismaMovieRepository } from "./database/PrismaMovieRepository";
import { PrismaMirrorRepository } from "./database/PrismaMirrorRepository";
import { PrismaWatchHistoryRepository } from "./database/PrismaWatchHistoryRepository";
import { HttpHeadLinkProber } from "./http/HttpHeadLinkProber";
import { TmdbApiGateway } from "./http/TmdbApiGateway";
import { MemoryCacheService } from "./cache/MemoryCacheService";
import { AutoEmbedMirrorResolver } from "./providers/AutoEmbedMirrorResolver";
import { TokenCryptoService } from "@/application/services/TokenCryptoService";
import { HealthCheckerService } from "@/application/services/HealthCheckerService";
import { CatalogService } from "@/application/services/CatalogService";
import { TmdbImportService } from "@/application/services/TmdbImportService";
import { WatchHistoryService } from "@/application/services/WatchHistoryService";

/**
 * Composition Root (Contenedor de Inyección de Dependencias v2.0).
 * Conecta las implementaciones concretas de Infraestructura con los Servicios de Aplicación
 * respetando el Principio de Inversión de Dependencias (DIP - SOLID).
 */
const movieRepository = new PrismaMovieRepository(prisma);
const mirrorRepository = new PrismaMirrorRepository(prisma);
const watchHistoryRepository = new PrismaWatchHistoryRepository(prisma);

const cacheService = new MemoryCacheService(500);
const mirrorResolver = new AutoEmbedMirrorResolver();
const linkProber = new HttpHeadLinkProber(7000);
const tmdbGateway = new TmdbApiGateway(cacheService);
const tokenCryptoService = new TokenCryptoService();

export const catalogService = new CatalogService(
  movieRepository,
  tokenCryptoService,
  tmdbGateway,
  mirrorResolver
);

export const healthCheckerService = new HealthCheckerService(
  mirrorRepository,
  movieRepository,
  linkProber
);

export const tmdbImportService = new TmdbImportService(
  tmdbGateway,
  movieRepository
);

export const watchHistoryService = new WatchHistoryService(
  watchHistoryRepository
);

export {
  tokenCryptoService,
  movieRepository,
  mirrorRepository,
  tmdbGateway,
  mirrorResolver,
  cacheService,
};
