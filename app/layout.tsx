import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BurnLink — notes that provably die",
  description:
    "Encrypted, self-destructing notes stored as Arkiv entities. Deleted by the protocol, not by a promise.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <video
            className="h-full w-full object-cover opacity-40"
            src="/fire-bg.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/75 to-zinc-950/90" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
