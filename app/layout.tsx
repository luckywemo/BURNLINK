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
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
