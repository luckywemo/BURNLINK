"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import EmberField from "@/components/EmberField";
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
  const [burning, setBurning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerRef.current) return;
    gsap.from(headerRef.current.children, {
      y: 26,
      opacity: 0,
      duration: 0.9,
      stagger: 0.14,
      ease: "power3.out",
    });
  }, []);

  useEffect(() => {
    if (result && resultRef.current) {
      gsap.from(resultRef.current.children, {
        y: 22,
        opacity: 0,
        duration: 0.55,
        stagger: 0.08,
        ease: "power3.out",
      });
    }
  }, [result]);

  function playBurnAnimation(): Promise<void> {
    return new Promise((resolve) => {
      setBurning(true);
      window.dispatchEvent(new Event("burnlink:burst"));
      // let React paint the word layer, then scatter it upward like embers
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const words = gsap.utils.toArray<HTMLElement>(".burn-word");
          if (!words.length) return resolve();
          gsap.to(words, {
            y: () => -(60 + Math.random() * 160),
            x: () => (Math.random() - 0.5) * 120,
            opacity: 0,
            filter: "blur(6px)",
            color: "#fb923c",
            duration: 1.15,
            ease: "power2.in",
            stagger: { each: 0.006, from: "random" },
            onComplete: () => resolve(),
          });
        })
      );
      setTimeout(resolve, 1600); // hard cap — never hang the UX
    });
  }

  async function burn() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const apiCall = (async () => {
        const { iv, ct, urlKey } = await encryptNote(text);
        const burnToken = randomUrlToken();
        const bh = await sha256b64(burnToken);
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iv, ct, ttl, once, bh }),
        });
        if (!res.ok) throw new Error(await res.text());
        const out = await res.json();
        return { ...out, urlKey, burnToken };
      })();
      const [out] = await Promise.all([apiCall, playBurnAnimation()]);
      setResult({
        link: `${location.origin}/n/${out.key}#k=${out.urlKey}&b=${out.burnToken}`,
        txHash: out.txHash,
        expiresAt: out.expiresAt,
      });
    } catch {
      setErr("Could not seal the note. Try again.");
    } finally {
      setBusy(false);
      setBurning(false);
    }
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <EmberField />

      <header ref={headerRef} className="mb-10">
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
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={12000}
              placeholder="Type something that shouldn't live forever…"
              className={`w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-orange-500/60 ${burning ? "opacity-0" : ""}`}
            />
            {burning && (
              <div className="pointer-events-none absolute inset-0 overflow-visible p-4 font-mono text-sm">
                {text
                  .split(/\s+/)
                  .slice(0, 160)
                  .map((w, i) => (
                    <span key={i} className="burn-word inline-block">
                      {w}&nbsp;
                    </span>
                  ))}
              </div>
            )}
          </div>

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
        <div ref={resultRef} className="space-y-5">
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
