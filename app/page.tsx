"use client";

import { useState } from "react";
import { encryptNote, randomUrlToken, sha256b64 } from "@/lib/note-crypto";

const TTLS = [
  { label: "10 minutes", value: 600 },
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
];

type Result = { link: string; txHash: string; expiresAt: string };

export default function Home() {
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState(86400);
  const [once, setOnce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  async function burn() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const { iv, ct, urlKey } = await encryptNote(text);
      const burnToken = randomUrlToken();
      const bh = await sha256b64(burnToken);
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iv, ct, ttl, once, bh }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { key, txHash, expiresAt } = await res.json();
      const link = `${location.origin}/n/${key}#k=${urlKey}&b=${burnToken}`;
      setResult({ link, txHash, expiresAt });
    } catch {
      setErr("Could not seal the note. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Burn<span className="text-orange-500">Link</span>
        </h1>
        <p className="mt-3 text-zinc-400">
          A note that provably dies. Encrypted in your browser, stored as an
          Arkiv entity, deleted by the protocol — not by a promise.
        </p>
      </header>

      {!result ? (
        <div className="space-y-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={12000}
            placeholder="Type something that shouldn't live forever…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-orange-500/60"
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-zinc-400">
              dies in
              <select
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-100 outline-none"
              >
                {TTLS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-zinc-400">
              <input
                type="checkbox"
                checked={once}
                onChange={(e) => setOnce(e.target.checked)}
                className="accent-orange-500"
              />
              burn after reading
            </label>
          </div>

          <button
            onClick={burn}
            disabled={busy || !text.trim()}
            className="w-full rounded-lg bg-orange-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Sealing…" : "Seal & burn"}
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-zinc-300">
            Sealed. The key is inside the link — it never touched a server.
          </p>
          <div className="break-all rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-orange-300">
            {result.link}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-100 transition hover:border-orange-500/60"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="text-xs text-zinc-500">
            Entity expires at block {result.expiresAt} ·{" "}
            <a
              className="underline hover:text-zinc-300"
              href={`https://tiramisu.explorer.arkiv.network/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              creation tx on the explorer
            </a>
          </p>
          <button
            onClick={() => {
              setResult(null);
              setText("");
            }}
            className="text-sm text-zinc-500 underline hover:text-zinc-300"
          >
            write another
          </button>
        </div>
      )}

      <footer className="mt-auto pt-16 text-xs text-zinc-600">
        Ciphertext lives on the Tiramisu testnet as a public, encrypted Arkiv
        entity. The decryption key exists only in the link fragment. When the
        entity dies — by reading or by Entity Expiration — nothing readable is
        left anywhere.
      </footer>
    </main>
  );
}
