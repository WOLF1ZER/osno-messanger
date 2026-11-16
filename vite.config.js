import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // custom service worker (src/sw.js) so we can handle push notifications
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: false, // registered from src/lib/pwa.js
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: true, type: "module" },
      manifest: {
        id: "/",
        name: "OSNO Messenger",
        short_name: "OSNO",
        description: "Private messaging, groups and calls.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#000000",
        theme_color: "#000000",
        categories: ["social", "communication"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "New chat", short_name: "New chat", url: "/?view=search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: "Calls", short_name: "Calls", url: "/?view=calls", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
        ],
      },
    }),
  ],
});
