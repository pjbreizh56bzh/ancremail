import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AncreMail — boîtes mail programmables pour agents IA", template: "%s · AncreMail" },
  description: "Créez des adresses email pour vos agents IA en un appel d'API : envoi, réception, webhooks.",
};

// Rendu dynamique obligatoire : chaque page reçoit le nonce CSP de sa requête.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
