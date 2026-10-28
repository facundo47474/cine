import { PrismaClient, MirrorFormat, MirrorStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🎬 Iniciando seed de catálogo de prueba en PILOTO...");

  const sampleMovies = [
    {
      tmdbId: 10378,
      title: "Big Buck Bunny",
      originalTitle: "Big Buck Bunny",
      synopsis:
        "En un bosque tranquilo e idílico, un conejo gigante de gran corazón decide tomar cartas en el asunto cuando tres roedores matones comienzan a acosar a las criaturas más pequeñas del bosque.",
      posterUrl:
        "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=800&auto=format&fit=crop&q=80",
      backdropUrl:
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600&auto=format&fit=crop&q=80",
      releaseYear: 2024,
      durationMins: 10,
      rating: 8.2,
      qualityBadge: "4K HDR",
      genres: ["Animación", "Comedia", "Aventura"],
      mirrors: [
        {
          serverName: "StreamCore MP4 (Principal)",
          language: "Latino",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 1,
        },
        {
          serverName: "CloudStream HLS (Mirror 2)",
          language: "Subtitulado",
          rawUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          format: MirrorFormat.HLS,
          quality: "1080p",
          priority: 2,
        },
      ],
    },
    {
      tmdbId: 45745,
      title: "Sintel: La Guardiana del Dragón",
      originalTitle: "Sintel",
      synopsis:
        "Una joven solitaria llamada Sintel rescata y entabla amistad con un pequeño dragón herido al que llama Scales. Cuando el dragón es secuestrado repentinamente, Sintel emprende una peligrosa búsqueda a través de tierras hostiles.",
      posterUrl:
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
      backdropUrl:
        "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80",
      releaseYear: 2025,
      durationMins: 15,
      rating: 8.7,
      qualityBadge: "HD",
      genres: ["Fantasía", "Acción", "Aventura"],
      mirrors: [
        {
          serverName: "FastCDN MP4 (Principal)",
          language: "Subtitulado",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 1,
        },
        {
          serverName: "BackupBucket MP4 (Mirror 2)",
          language: "Latino",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          format: MirrorFormat.MP4,
          quality: "720p",
          priority: 2,
        },
      ],
    },
    {
      tmdbId: 136409,
      title: "Tears of Steel: Ciber-Resistencia",
      originalTitle: "Tears of Steel",
      synopsis:
        "En un Ámsterdam postapocalíptico dominado por máquinas letales, un grupo de soldados y científicos se reúne en la histórica Oude Kerk para intentar revivir un evento del pasado que podría salvar a la humanidad.",
      posterUrl:
        "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=800&auto=format&fit=crop&q=80",
      backdropUrl:
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&auto=format&fit=crop&q=80",
      releaseYear: 2026,
      durationMins: 12,
      rating: 8.4,
      qualityBadge: "4K",
      genres: ["Ciencia Ficción", "Acción"],
      mirrors: [
        {
          serverName: "CyberNode MP4 (Principal)",
          language: "Subtitulado",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 1,
        },
        {
          serverName: "Mux Adaptive HLS (Mirror 2)",
          language: "Original",
          rawUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          format: MirrorFormat.HLS,
          quality: "1080p",
          priority: 2,
        },
      ],
    },
    {
      tmdbId: 19265,
      title: "Elephants Dream: El Laberinto Mecánico",
      originalTitle: "Elephants Dream",
      synopsis:
        "Proog y Emo recorren las entrañas de una colosal e infinita Máquina surrealista. Mientras Proog intenta enseñarle la belleza del mecanismo, Emo comienza a cuestionar si todo ese mundo artificial es real o una trampa.",
      posterUrl:
        "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80",
      backdropUrl:
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&auto=format&fit=crop&q=80",
      releaseYear: 2025,
      durationMins: 11,
      rating: 7.9,
      qualityBadge: "HD",
      genres: ["Ciencia Ficción", "Misterio"],
      mirrors: [
        {
          serverName: "DirectPlay MP4 (Principal)",
          language: "Latino",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 1,
        },
      ],
    },
    {
      tmdbId: 99001,
      title: "Escape de Alta Velocidad (Demo Failover)",
      originalTitle: "High Octane Run",
      synopsis:
        "Película de demostración configurada con un Mirror #1 intencionalmente caído y un Mirror #2 funcional para que puedas probar en vivo cómo el reproductor hace Failover automático al Servidor 2 y reporta el enlace roto al Health Checker.",
      posterUrl:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80",
      backdropUrl:
        "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1600&auto=format&fit=crop&q=80",
      releaseYear: 2026,
      durationMins: 15,
      rating: 8.9,
      qualityBadge: "HD",
      genres: ["Acción", "Thriller"],
      mirrors: [
        {
          serverName: "Mirror #1 (Enlace Roto de Prueba)",
          language: "Latino",
          rawUrl: "https://servidor-caido-simulacion.invalid/video-roto-404.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 1,
        },
        {
          serverName: "Mirror #2 (Respaldo Activo Automático)",
          language: "Latino",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          format: MirrorFormat.MP4,
          quality: "1080p",
          priority: 2,
        },
        {
          serverName: "Mirror #3 (Embed Sandbox Externo)",
          language: "Subtitulado",
          rawUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
          format: MirrorFormat.EMBED,
          quality: "720p",
          priority: 3,
        },
      ],
    },
  ];

  for (const item of sampleMovies) {
    const existing = await prisma.movie.findUnique({
      where: { tmdbId: item.tmdbId },
    });

    if (existing) {
      await prisma.mirrorLink.deleteMany({ where: { movieId: existing.id } });
      await prisma.movie.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          originalTitle: item.originalTitle,
          synopsis: item.synopsis,
          posterUrl: item.posterUrl,
          backdropUrl: item.backdropUrl,
          releaseYear: item.releaseYear,
          durationMins: item.durationMins,
          rating: item.rating,
          qualityBadge: item.qualityBadge,
          genres: item.genres,
          isAvailable: true,
          mirrors: {
            create: item.mirrors.map((m) => ({
              ...m,
              status: MirrorStatus.ACTIVE,
              consecutiveFailures: 0,
            })),
          },
        },
      });
      console.log(`✅ Película actualizada: ${item.title}`);
    } else {
      await prisma.movie.create({
        data: {
          tmdbId: item.tmdbId,
          title: item.title,
          originalTitle: item.originalTitle,
          synopsis: item.synopsis,
          posterUrl: item.posterUrl,
          backdropUrl: item.backdropUrl,
          releaseYear: item.releaseYear,
          durationMins: item.durationMins,
          rating: item.rating,
          qualityBadge: item.qualityBadge,
          genres: item.genres,
          isAvailable: true,
          mirrors: {
            create: item.mirrors.map((m) => ({
              ...m,
              status: MirrorStatus.ACTIVE,
              consecutiveFailures: 0,
            })),
          },
        },
      });
      console.log(`✅ Película insertada: ${item.title}`);
    }
  }

  console.log("🚀 Seed completado con éxito.");
}

main()
  .catch((err) => {
    console.error("❌ Error durante el seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
