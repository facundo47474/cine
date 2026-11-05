# Auditoría Técnica y Corrección Definitiva: Arquitectura de Series de TV

---

## 1. Diagnóstico de Errores Lógicos Detectados en la Implementación Previa

Al auditar el documento `resumen_arquitectura_series_y_fixes.md` y contrastarlo con el código fuente real y la base de datos PostgreSQL, se identificaron **3 errores lógicos críticos** en la implementación anterior:

### Error Lógico #1: Series en Inglés y Barra de Servidores Manual dentro del Video
- **Causa raíz:** En `src/application/services/SeriesService.ts`, la función `getEpisodePlaybackData` fue programada con agregadores genéricos por TMDB ID (`multiembed.mov`, `autoembed.co`, `vidlink.pro`, `vidsrc.me`).
- **Por qué fallaba:**
  1. Aunque se eliminaron los botones de servidores en React, **esos agregadores externos renderizan su propio menú de selección de servidores dentro del `<iframe>`** y reproducen por defecto en **inglés**, rompiendo la regla de negocio de evaluación interna 100% transparente.
  2. Mientras tanto, el módulo de **Películas** (`AutoEmbedMirrorResolver.ts` y `/api/stream/[token]/route.ts`) sí resolvía en el backend el enlace directo de **Streamwish en Español Latino (`LAT`)** desencriptando el reto PoW + AES-256-CBC de `embed69.org` y extrayendo el flujo HLS `.m3u8` (`hls2`) para reproducirlo en nuestro reproductor nativo `<video id="pilotoVideo">` sin anuncios ni menús de servidores.
  3. El modelo anterior nunca conectó las Series a este flujo porque el endpoint `/tv/{id}` de TMDB no devuelve `imdb_id` en la raíz (requiere consultar `/tv/{id}/external_ids`) y desconocía el formato de episodios de `embed69.org` (`{imdbId}-{season}x{episodePadded}`, ej. `tt1405406-1x01`) y de `playlatinsrc.co` (`/custom/serial/{imdbId}/{season}/{episode}`).

### Error Lógico #2: Series Vistas Excluidas de la Sección "Continuar viendo"
- **Causa raíz:** En `src/infrastructure/database/PrismaWatchHistoryRepository.ts`, el método `findByUserId(userId, limit)` tenía la cláusula:
  ```ts
  where: { userId, movieId: { not: null } }
  ```
- **Por qué fallaba:**
  - Cuando un usuario reproduce un capítulo de una serie, `saveEpisodeProgress` guarda el progreso en la tabla `WatchHistory` con `episodeId: "<uuid>"` y **`movieId: null`**.
  - Al filtrar `movieId: { not: null }`, el repositorio descartaba el **100% de los historiales de episodios**, por lo que `WatchHistoryService.getContinueWatching(userId)` jamás devolvía ninguna serie a la página principal (`/`).

### Error Lógico #3: Textos Genéricos en Inglés ("Season X" / "Episode X") en TMDB
- **Causa raíz:** En `src/infrastructure/http/TmdbApiGateway.ts`, cuando una serie en TMDB no tenía traducción en `es-MX`, hacía fallback directo a `en-US` sin intentar primero `es-ES` y sin normalizar nombres genéricos como `"Season 1"` o `"Episode 1"` a `"Temporada 1"` y `"Episodio 1"`.

---

## 2. Soluciones Definitivas Implementadas

### 2.1. Audio Español Latino Automático y Reproductor Directo Sin Selector de Servidores
1. **Obtención de `imdb_id` para Series en TMDB (`ITmdbGateway.ts` y `TmdbApiGateway.ts`):**
   - Se implementó `fetchTvImdbId(tmdbId)` consultando `/tv/{tmdbId}/external_ids` con caché en memoria (`tmdb:tv:imdb:{tmdbId}`).
   - Se añadió fallback `es-MX` -> `es-ES` -> `en-US` y normalización automática de títulos `"Season X"` -> `"Temporada X"` y `"Episode X"` -> `"Episodio X"`.
2. **Desencriptación Backend de Episodios en `Embed69` y `PlayLatinSrc` (`/api/stream/[token]/route.ts`):**
   - `resolveDirectStreamwishUrlFromEmbed69` ahora soporta slugs de episodios (`tt1234567-1x01` con fallback automático a `tt1234567-1x1`), priorizando el bloque de idioma `LAT` -> `ESP` -> `SUB`, desencriptando en el servidor el enlace de `Streamwish` (`hglink.to/e/...`) y extrayendo el stream directo `.m3u8` (`extractStreamwishDirectHls`) para inyectarlo en el reproductor HTML5 `<video id="pilotoVideo">`.
   - `resolveFallbackFromPlayLatin` ahora detecta episodios (`/(tt\d+)-(\d+)x(\d+)/i`) y consulta `https://playlatinsrc.co/custom/serial/{imdbId}/{season}/{episode}` con `type: "tv"` en `/api/resolve` si `embed69` llegara a estar caído.
3. **Eliminación de Agregadores Manuales en Series (`SeriesService.ts`):**
   - Se eliminaron `multiembed.mov`, `autoembed.co` y `vidlink.pro`.
   - Ahora cada episodio utiliza exclusivamente el flujo interno desencriptado (`Streamwish-Lat` en Español Latino como prioridad #1 y `Streamwish-Sub` para Inglés Subtitulado).

### 2.2. Inclusión de Series en "Continuar viendo" con Deduplicación Inteligente
1. **Repositorio Unificado (`PrismaWatchHistoryRepository.ts`):**
   - Se eliminó el filtro restrictivo `movieId: { not: null }` en `findByUserId`.
   - La consulta ahora incluye tanto `movie` como la jerarquía `episode -> season -> series` (`where: { userId, completed: false }`).
   - Se reconstruye la entidad `Movie` a partir de `row.episode.season.series` cuando se trata de un episodio, adjuntando `episodeInfo` (`episodeId`, `seasonNumber`, `episodeNumber`, `title`).
   - Se aplica **deduplicación por serie (`seenMediaIds`)**: si el usuario vio varios capítulos de la misma serie, en la fila **"Continuar viendo"** aparece una única tarjeta por serie correspondiente al último capítulo en curso.
2. **DTO y Tarjeta de Continuar Viendo (`WatchHistoryService.ts`, `MovieCard.tsx`, `page.tsx`):**
   - `ContinueWatchingItemDto` ahora expone `mediaType`, `episodeId`, `seasonNumber`, `episodeNumber` y `episodeTitle`.
   - En la fila **"Continuar viendo"**, las tarjetas de series muestran el badge `SERIE • T{s}:E{e}`, el subtítulo del episodio, el porcentaje de avance con su barra roja y enlazan directamente a `/watch/episode/{episodeId}` para reanudar la reproducción en el segundo exacto.

