import type { Metadata } from "next";
import localFont from "next/font/local";
import FireBg from "@/components/FireBg";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: "BurnLink — notes that provably die",
  description:
    "Encrypted, self-destructing notes stored as Arkiv entities. Deleted by the protocol, not by a promise.",
  openGraph: {
    title: "BurnLink — notes that provably die",
    description:
      "Encrypted in your browser, stored as an Arkiv entity, deleted by the protocol. The key never leaves the link.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased">
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <FireBg />
          <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/60 to-background/80" />
          <div className="ember-glow absolute inset-0" />
          <div className="dot-grid absolute inset-0" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
