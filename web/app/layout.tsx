import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recto — Verso",
  description: "Se connecter à un écran Recto via le navigateur",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
