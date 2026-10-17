import type { Metadata } from "next";
import localFont from "next/font/local";
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
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
          <video
            className="fire-bg h-full w-full object-cover opacity-40"
            src="/fire-bg.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background/90" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
