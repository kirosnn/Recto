import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recto",
  description: "Partage d'écran P2P serverless",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-zinc-950 text-white">{children}</body>
    </html>
  );
}
