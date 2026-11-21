import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PILOTO Streaming — Películas, Series y Estrenos en HD";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

/**
 * Imagen OpenGraph social generada dinámicamente para Google, WhatsApp, X y Facebook.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          backgroundColor: "#0b0b0e",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(229, 9, 20, 0.34), transparent 45%), radial-gradient(circle at 10% 90%, rgba(229, 9, 20, 0.16), transparent 42%)",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 20px",
                borderRadius: "10px",
                backgroundColor: "#E50914",
                color: "#ffffff",
                fontSize: "28px",
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              PILOTO
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "20px",
                fontWeight: 600,
                color: "#d4d4d8",
              }}
            >
              Streaming HD
            </div>
          </div>

          <div
            style={{
              display: "flex",
              padding: "8px 18px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "#e4e4e7",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            cine-ddbt.vercel.app
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "960px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            Películas, Series y Estrenos en HD
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              fontWeight: 500,
              lineHeight: 1.4,
              color: "#a1a1aa",
            }}
          >
            Audio Latino y Subtitulado • Smart TV (Chromecast y AirPlay) • Piloto Plus sin anuncios
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: "999px",
              backgroundColor: "rgba(16, 185, 129, 0.16)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              color: "#6ee7b7",
              fontSize: "18px",
              fontWeight: 700,
            }}
          >
            Acceso con Google
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#f4f4f5",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Catálogo en la Nube
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#f4f4f5",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Modo Escudo Piloto Plus
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
