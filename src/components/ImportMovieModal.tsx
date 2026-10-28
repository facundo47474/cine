"use client";

import React, { useState } from "react";
import { X, Plus, Trash2, Film } from "lucide-react";

interface ImportMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportMovieModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportMovieModalProps) {
  const [mode, setMode] = useState<"tmdb" | "manual">("tmdb");
  const [tmdbId, setTmdbId] = useState("550"); // Ej: Fight Club (550) o Interstellar (157336)
  const [manualTitle, setManualTitle] = useState("");
  const [manualSynopsis, setManualSynopsis] = useState("");
  const [manualPoster, setManualPoster] = useState("");
  const [qualityBadge, setQualityBadge] = useState("HD");

  const [mirrors, setMirrors] = useState([
    {
      serverName: "StreamWish Principal",
      language: "Latino",
      rawUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      format: "MP4",
      quality: "1080p",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const addMirrorRow = () => {
    setMirrors((prev) => [
      ...prev,
      {
        serverName: `Mirror Respaldo #${prev.length + 1}`,
        language: "Subtitulado",
        rawUrl: "",
        format: "MP4",
        quality: "1080p",
      },
    ]);
  };

  const removeMirrorRow = (index: number) => {
    setMirrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const validMirrors = mirrors.filter((m) => m.rawUrl.trim().length > 0);
      if (validMirrors.length === 0) {
        throw new Error("Agrega al menos una URL de video válida.");
      }

      const payload =
        mode === "tmdb"
          ? {
              tmdbId: Number(tmdbId),
              qualityBadge,
              mirrors: validMirrors,
            }
          : {
              qualityBadge,
              mirrors: validMirrors,
              manualMovie: {
                title: manualTitle,
                synopsis: manualSynopsis,
                posterUrl: manualPoster,
                releaseYear: 2026,
              },
            };

      const res = await fetch("/api/admin/import-tmdb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo importar la película.");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error inesperado al guardar."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-white/15 rounded-xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-netflix-red" />
            <h2 className="text-lg font-bold text-white">
              Agregar Película y Mirrors al Catálogo
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de modo */}
        <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-lg border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("tmdb")}
            className={`py-2 rounded-md transition ${
              mode === "tmdb"
                ? "bg-netflix-red text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Importar con TMDB ID
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`py-2 rounded-md transition ${
              mode === "manual"
                ? "bg-netflix-red text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Carga Manual (Sin API Key)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "tmdb" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  ID de Película en TMDB (Ej: 157336 Interstellar)
                </label>
                <input
                  type="number"
                  required
                  value={tmdbId}
                  onChange={(e) => setTmdbId(e.target.value)}
                  className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Calidad Badge
                </label>
                <select
                  value={qualityBadge}
                  onChange={(e) => setQualityBadge(e.target.value)}
                  className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="HD">HD</option>
                  <option value="4K HDR">4K HDR</option>
                  <option value="CAM">CAM</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Título de la Película
                </label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Ej: El Eternauta - Especial"
                  className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Sinopsis
                </label>
                <textarea
                  rows={2}
                  value={manualSynopsis}
                  onChange={(e) => setManualSynopsis(e.target.value)}
                  placeholder="Descripción de la película..."
                  className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  URL del Póster (Opcional)
                </label>
                <input
                  type="url"
                  value={manualPoster}
                  onChange={(e) => setManualPoster(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          {/* Lista de Mirrors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300">
                Enlaces Mirrors (Se cifrarán con AES-256-GCM)
              </label>
              <button
                type="button"
                onClick={addMirrorRow}
                className="inline-flex items-center gap-1 text-xs text-netflix-red hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir Mirror Espejo
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {mirrors.map((m, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-black/60 border border-white/10 space-y-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={m.serverName}
                      onChange={(e) => {
                        const copy = [...mirrors];
                        copy[idx].serverName = e.target.value;
                        setMirrors(copy);
                      }}
                      placeholder="Nombre Servidor"
                      className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                    <select
                      value={m.format}
                      onChange={(e) => {
                        const copy = [...mirrors];
                        copy[idx].format = e.target.value;
                        setMirrors(copy);
                      }}
                      className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="MP4">MP4 Directo</option>
                      <option value="HLS">HLS (.m3u8)</option>
                      <option value="EMBED">Iframe Embed</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <select
                        value={m.language}
                        onChange={(e) => {
                          const copy = [...mirrors];
                          copy[idx].language = e.target.value;
                          setMirrors(copy);
                        }}
                        className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="Latino">Latino</option>
                        <option value="Subtitulado">Subtitulado</option>
                        <option value="Español">Español</option>
                      </select>
                      {mirrors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMirrorRow(idx)}
                          className="p-1 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="url"
                    required
                    value={m.rawUrl}
                    onChange={(e) => {
                      const copy = [...mirrors];
                      copy[idx].rawUrl = e.target.value;
                      setMirrors(copy);
                    }}
                    placeholder="https://servidor.com/video.mp4 o .m3u8"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-netflix-red text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar en Catálogo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
