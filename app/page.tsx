"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import EmberField from "@/components/EmberField";
import ScrambleText from "@/components/ScrambleText";
import { encryptNote, randomUrlToken, sha256b64 } from "@/lib/note-crypto";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { EMBER, EMBER_SOFT, EMBER_GLOW } from "@/lib/tokens";

const TTLS = [
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "10m", value: 600 },
  { label: "1h", value: 3600 },
  { label: "24h", value: 86400 },
];

const UNITS = [
  { label: "sec", value: 1 },
  { label: "min", value: 60 },
  { label: "hr", value: 3600 },
  { label: "day", value: 86400 },
];

const MIN_TTL = 15;
const MAX_TTL = 2_592_000; // 30 days

const STEPS = [
  {
    n: "1",
    title: "Encrypts in your browser",
    body: "AES-GCM-256, on your device. The key lives after the # in your link — it never reaches a server or the chain.",
  },
  {
    n: "2",
    title: "Stored as an Arkiv entity",
    body: "Only ciphertext goes on the Tiramisu testnet — publicly readable, permanently unreadable without your link.",
  },
  {
    n: "3",
    title: "Deleted by the protocol",
    body: "Reading burns it, or Entity Expiration kills it on schedule. The network enforces deletion — no one can keep a copy.",
  },
];

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70";

type Result = { link: string; txHash: string; expiresAt: string };

export default function Home() {
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState(86400);
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState("45");
  const [customUnit, setCustomUnit] = useState(60);
  const [once, setOnce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [burning, setBurning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !headerRef.current) return;
    gsap.from(headerRef.current.children, {
      y: 26,
      opacity: 0,
      duration: 0.9,
      stagger: 0.14,
      ease: "power3.out",
    });
  }, [reduced]);

  useEffect(() => {
    if (reduced || !result || !resultRef.current) return;
    gsap.from(resultRef.current.children, {
      y: 22,
      opacity: 0,
      duration: 0.55,
      stagger: 0.08,
      ease: "power3.out",
    });
  }, [result, reduced]);

  function playBurnAnimation(): Promise<void> {
    if (reduced) return Promise.resolve();
    return new Promise((resolve) => {
      setBurning(true);
      window.dispatchEvent(new Event("burnlink:burst"));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const words = gsap.utils.toArray<HTMLElement>(".burn-word");
          const composer = composerRef.current;
          const tl = gsap.timeline({ onComplete: resolve });
          // ignite the edges first
          if (composer) {
            tl.to(composer, {
              boxShadow: `0 0 70px ${EMBER_GLOW}`,
              borderColor: EMBER,
              duration: 0.35,
              ease: "power2.in",
            });
          }
          if (words.length) {
            // chars catch fire, then scatter upward as embers
            tl.to(
              words,
              { color: EMBER_SOFT, duration: 0.25, stagger: 0.004 },
              0.15
            ).to(
              words,
              {
                y: () => -(70 + Math.random() * 180),
                x: () => (Math.random() - 0.5) * 140,
                opacity: 0,
                filter: "blur(6px)",
                duration: 1.0,
                ease: "power2.in",
                stagger: { each: 0.005, from: "random" },
              },
              0.4
            );
          }
          if (composer) {
            tl.to(
              composer,
              { opacity: 0, y: -18, duration: 0.4, ease: "power2.in" },
              1.15
            );
          }
        })
      );
      setTimeout(resolve, 2200); // hard cap — never hang the UX
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

  const segmentCls = (active: boolean) =>
    `px-2.5 py-1.5 font-mono text-xs transition sm:px-3 ${FOCUS} ${
      active
        ? "bg-primary text-primary-foreground shadow-[0_0_16px_rgba(249,115,22,0.45)]"
        : "text-muted-foreground hover:bg-border hover:text-foreground"
    }`;

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <EmberField />

      <header ref={headerRef} className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="animate-flicker">Burn</span>
          <span className="text-primary">Link</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          A note that provably dies. Encrypted in your browser, stored as an
          Arkiv entity, deleted by the protocol — not by a promise.
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {busy ? "Sealing your note on-chain." : ""}
        {result ? "Note sealed. Link generated." : ""}
        {err}
      </div>

      {!result ? (
        <div className="space-y-5">
          <div ref={composerRef} className="relative rounded-lg">
            <label htmlFor="note" className="sr-only">
              Note text
            </label>
            <textarea
              id="note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={12000}
              placeholder="Type something that shouldn't live forever…"
              className={`w-full rounded-lg border border-border bg-card/80 p-4 font-mono text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-subtle focus:border-primary/60 ${
                burning ? "opacity-0" : ""
              }`}
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
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span id="ignite-label">ignite in</span>
              <div
                role="group"
                aria-labelledby="ignite-label"
                className="flex flex-wrap overflow-hidden rounded-lg border border-border bg-card/80"
              >
                {TTLS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={!custom && ttl === t.value}
                    onClick={() => {
                      setCustom(false);
                      setTtl(t.value);
                    }}
                    className={segmentCls(!custom && ttl === t.value)}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={custom}
                  onClick={() => setCustom(true)}
                  className={segmentCls(custom)}
                >
                  custom
                </button>
              </div>
              {custom && (
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    aria-label="Custom duration"
                    value={customVal}
                    onChange={(e) => {
                      setCustomVal(e.target.value);
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0) {
                        setTtl(
                          Math.min(
                            MAX_TTL,
                            Math.max(MIN_TTL, Math.round(n * customUnit))
                          )
                        );
                      }
                    }}
                    className="w-20 rounded-md border border-border bg-card/80 px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary/60"
                  />
                  <select
                    aria-label="Time unit"
                    value={customUnit}
                    onChange={(e) => {
                      const u = Number(e.target.value);
                      setCustomUnit(u);
                      const n = Number(customVal);
                      if (Number.isFinite(n) && n > 0) {
                        setTtl(
                          Math.min(
                            MAX_TTL,
                            Math.max(MIN_TTL, Math.round(n * u))
                          )
                        );
                      }
                    }}
                    className="rounded-md border border-border bg-card/80 px-2 py-1.5 font-mono text-xs text-foreground outline-none"
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
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
            className={`w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-soft hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
          >
            {busy ? "Sealing…" : "Seal & burn"}
          </button>
          {err && <p className="text-sm text-destructive">{err}</p>}

          <section aria-label="How it works" className="pt-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm"
                >
                  <p className="font-mono text-xs text-primary">{s.n}</p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {s.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div ref={resultRef} className="space-y-5">
          <div className="animate-ember rounded-xl border border-primary/50 bg-card/80 p-6 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
              sealed — your link is forged
            </p>
            <div className="mt-3 break-all font-mono text-sm leading-relaxed text-primary-mute">
              <ScrambleText text={result.link} speed={18} per={4} />
            </div>
            <p className="mt-3 text-xs text-subtle">
              The decryption key lives after the <code>#</code> — it never
              touched a server or the chain.
            </p>
          </div>

          <button
            onClick={() => {
              navigator.clipboard.writeText(result.link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={`w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-soft ${FOCUS}`}
          >
            {copied ? "Copied — send it" : "Copy link"}
          </button>

          <p className="text-xs text-subtle">
            Entity expires at block {result.expiresAt} ·{" "}
            <a
              className={`underline transition hover:text-foreground ${FOCUS}`}
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
            className={`rounded text-sm text-subtle underline transition hover:text-foreground ${FOCUS}`}
          >
            write another
          </button>
        </div>
      )}

      <footer className="mt-auto pt-16 text-xs text-subtle">
        Ciphertext lives on the Tiramisu testnet as a public, encrypted Arkiv
        entity. The decryption key exists only in the link fragment. When the
        entity dies — by reading or by Entity Expiration — nothing readable is
        left anywhere.
      </footer>
    </main>
  );
}
