// Onda R — Capacitor scaffold (iOS/Android)
//
// Este arquivo é SÓ configuração; os pacotes @capacitor/core, @capacitor/cli,
// @capacitor/ios e @capacitor/android NÃO são instalados por padrão porque
// exigem toolchain nativa (Xcode/Android Studio) — deve ser executado localmente
// pelo dev, não no ambiente Lovable.
//
// Passos locais para gerar os apps nativos:
//   1. bun add -d @capacitor/cli
//   2. bun add @capacitor/core @capacitor/ios @capacitor/android
//   3. bunx cap init "KS MultiMake" "app.ksmultimake" --web-dir=dist
//   4. bun run build
//   5. bunx cap add ios && bunx cap add android
//   6. bunx cap sync
//   7. bunx cap open ios  (ou open android)
//
// Após instalado no dispositivo, o app abre a URL "server.url" abaixo
// (URL publicada do PDV) — assim TODOS os fixes web são propagados sem
// reenviar app nas lojas. Para modo totalmente offline, remova server.url.

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.ksmultimake",
  appName: "KS MultiMake",
  webDir: "dist",
  server: {
    // Trocar por URL de produção publicada
    url: "https://ksmultimake.lovable.app",
    cleartext: false,
  },
  ios: { contentInset: "always" },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#ec1e79",
      showSpinner: false,
    },
  },
};

export default config;
