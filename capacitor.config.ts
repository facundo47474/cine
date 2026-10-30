import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cine.piloto",
  appName: "PILOTO Streaming",
  webDir: "public",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    url: "https://tu-dominio.com",
    cleartext: false,
    allowNavigation: ["*"],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
  },
};

export default config;
