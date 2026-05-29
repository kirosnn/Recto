import type { MetadataRoute } from "next";

// PWA manifest. Installing to the home screen (especially on iOS, where the
// Fullscreen API can't target a <div>) launches Verso without browser chrome —
// the only way to get true fullscreen on iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recto",
    short_name: "Recto",
    description: "Partage d'écran P2P serverless — contrôle à distance.",
    start_url: "/verso",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/assets/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
