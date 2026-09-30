import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const shared = path.resolve(__dirname, "../supabase/functions/_shared");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Rafiq — Arabic Class Companion",
        short_name: "Rafiq",
        description: "Understand every page of your Arabic textbook: meaning, easy pronunciation and audio.",
        lang: "en",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f5f0",
        theme_color: "#2f5d50",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  // Pure TypeScript shared with the edge functions (vowel-mark diff, card types).
  resolve: { alias: { "@shared": shared } },
  server: { fs: { allow: [".", shared] } },
});
