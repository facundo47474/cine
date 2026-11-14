# PILOTO Streaming v2.0

Plataforma de streaming de películas y series construida con **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, **PostgreSQL** y **NextAuth (Google OAuth 2.0)** bajo principios de **Clean Architecture** y **SOLID**.

---

## Arquitectura del Proyecto

El código fuente dentro de `src/` está organizado en cuatro capas desacopladas:

1. **`src/domain/` (Capa de Dominio — Reglas de Negocio Puras)**
   - `entities/`: Entidades de negocio (`Movie`, `MirrorLink`, `Season`, `Episode`, `EpisodeMirror`, `WatchHistory`).
   - `enums/`: Enumeraciones de formato (`MirrorFormat`) y salud de enlaces (`MirrorStatus`).
   - `interfaces/`: Contratos de repositorios y servicios externos (`IMovieRepository`, `ISeriesRepository`, `IMirrorRepository`, `IWatchHistoryRepository`, `ITmdbGateway`, `IMirrorResolver`, `ITokenCryptoService`, `ILinkProber`, `ICacheService`).
   - `utils/streamwishMatcher.ts`: Fuente única de verdad para la detección de dominios de Streamwish, normalización de embeds y política de priorización determinista.

2. **`src/application/` (Capa de Casos de Uso y Servicios de Aplicación)**
   - `services/CatalogService.ts`: Construcción del feed híbrido (local + TMDB), exploración paginada y firma de streams de películas.
   - `services/SeriesService.ts`: Auto-ingesta bajo demanda de series y temporadas desde TMDB, cálculo del botón inteligente de reanudación (`Smart CTA`) y reproducción de capítulos.
   - `services/WatchHistoryService.ts`: Sincronización de progreso y fila personalizada «Continuar viendo» con deduplicación por serie.
   - `services/TokenCryptoService.ts`: Cifrado simétrico autenticado (`AES-256-GCM`) para ocultar las URLs crudas de los servidores de video.
   - `services/HealthCheckerService.ts`: Auditoría determinista de enlaces y baja lógica automática (`Soft Delete`).
   - `services/TmdbImportService.ts`: Importación administrativa de películas desde TMDB.
   - `dto/`: Objetos de transferencia de datos (`CatalogFeedDto`, `PlaybackStreamDto`, `SeriesDto`).

3. **`src/infrastructure/` (Adaptadores de Infraestructura e Inyección de Dependencias)**
   - `container.ts`: *Composition Root* que instancia e inyecta repositorios y gateways.
   - `database/`: Repositorios concretos con Prisma (`PrismaMovieRepository`, `PrismaSeriesRepository`, `PrismaMirrorRepository`, `PrismaWatchHistoryRepository`) y mapeadores centralizados (`mappers/PrismaDomainMappers.ts`).
   - `providers/`:
     - `AutoEmbedMirrorResolver.ts`: Orquestador de resolución de mirrors por IMDb ID / TMDB ID.
     - `Embed69Decoder.ts`: Resolución de retos Proof-of-Work (SHA-256), desencriptación `AES-256-CBC` y parser DOM de `embed69.org`.
     - `PlayLatinClient.ts`: Cliente para extracción de fuentes desde `playlatinsrc.co`.
     - `DeanEdwardsUnpacker.ts`: Desempacador seguro en TypeScript puro para bloques `eval(function(p,a,c,k,e,d)...)`.
     - `StreamManifestExtractor.ts`: Extractor y verificador de manifiestos HLS (`.m3u8`) y `.mp4`.
   - `http/`: `TmdbApiGateway.ts` (con caché LRU en memoria) y `HttpHeadLinkProber.ts`.
   - `auth/`: Configuración de NextAuth (`authOptions.ts`) y helper de sesión (`sessionHelper.ts`).
   - `cache/`: `MemoryCacheService.ts` (LRU con TTL).
   - `security/`: `RateLimiter.ts`.

4. **`src/app/` y `src/components/` (Capa de Presentación y Rutas Next.js)**
   - `src/app/api/`: Endpoints REST (`/api/movies`, `/api/series`, `/api/history`, `/api/extractor`, `/api/stream/[token]`, `/api/stream-proxy`, `/api/health/cron`).
   - `src/components/`: Componentes de interfaz y reproductor inteligente (`SmartVideoPlayer.tsx`, `video/SmartPlayer.tsx`).

---

## Scripts Disponibles

```bash
npm run dev          # Inicia el servidor de desarrollo en http://localhost:3000
npm run build        # Genera el cliente Prisma y compila la aplicación para producción
npm run typecheck    # Ejecuta validación estática de tipos con TypeScript (tsc --noEmit)
npm run lint         # Ejecuta el linter de Next.js
npm run db:push      # Sincroniza el esquema Prisma con PostgreSQL
npm run db:seed      # Carga el catálogo inicial de demostración
npm run health-check # Ejecuta la auditoría de enlaces Mirror por CLI
```
