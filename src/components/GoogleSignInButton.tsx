"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

interface GoogleSignInButtonProps {
  label?: string;
  className?: string;
}

/**
 * Botón reutilizable de inicio de sesión y registro en un clic mediante Google OAuth 2.0.
 */
export default function GoogleSignInButton({
  label = "Ingresar gratis con Google",
  className = "",
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <button
      type="button"
      onClick={() => void handleSignIn()}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg bg-white hover:bg-zinc-200 active:scale-[0.99] text-black font-bold text-sm sm:text-base transition shadow-xl disabled:opacity-60 ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin text-zinc-800" />
          <span>Conectando con Google...</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.7-.2-2.5H12v4.8h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
            />
            <path
              fill="#FBBC05"
              d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.8z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 16c1.9 3.9 5.8 7 10.4 7z"
            />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
