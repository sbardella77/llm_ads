import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLMAds",
  description: "Gestione multi-cliente delle campagne ChatGPT Ads",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
