"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import EmberField from "@/components/EmberField";
import ScrambleText from "@/components/ScrambleText";
import { arkivPublic } from "@/lib/arkiv-public";
import { decryptNote } from "@/lib/note-crypto";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { EMBER_SOFT } from "@/lib/tokens";

type Phase = "loading" | "no-key" | "gone" | "reading" | "burning" | "dead";

const EXPLORER = "https://tiramisu.explorer.arkiv.network";
const READ_SECONDS = 4.5; // how long the note stays readable before igniting

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70";

export default function NoteClient({ noteKey }: { noteKey: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState<{
    text: string;
    once: boolean;
    creator?: string;
    expiresAt?: bigint;
  } | null>(null);
  const [burnTx, setBurnTx] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [ignite, setIgnite] = useState(false);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const burnedBurstDone = useRef(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const urlKey = hash.get("k");
      const burnToken = hash.get("b") ?? "";
      if (!urlKey) {
        setPhase("no-key");
        return;
      }
      let entity;
      try {
        entity = await arkivPublic.getEntity(noteKey as `0x${string}`);
      } catch {
        setPhase("gone");
        return;
      }
      if (cancelled) return;

      const parsed = entity.toJson() as { v: number; iv: string; ct: string };
      const text = await decryptNote(parsed.iv, parsed.ct, urlKey);
      const modeAttr = entity.attributes?.mode as
        | { value?: string }
        | undefined;
      const once = (modeAttr?.value ?? "timed") === "once";

      setNote({
        text,
        once,
        creator: entity.creator,
        expiresAt: entity.expiresAt,
      });
      setPhase("reading");

      if (!once && entity.expiresAt !== undefined) {
        try {
          const t = await arkivPublic.getBlockTiming();
          setSecsLeft(
            Math.max(0, Number(entity.expiresAt - t.currentBlock) * 2)
          );
        } catch {
          /* countdown is cosmetic */
        }
      }

      if (once) {
        // fire the real on-chain deletion shortly after the reveal starts —
        // the visuals lag behind, the delete does not
        setTimeout(async () => {
          try {
            const r = await fetch(`/api/notes/${noteKey}/burn`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ b: burnToken }),
            });
            const { txHash } = await r.json();
            if (!cancelled) setBurnTx(txHash);
          } catch {
            /* deletion races are fine — entity is gone either way */
          }
        }, 1200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteKey]);

  // after the scramble reveal, once-notes count down then ignite
  useEffect(() => {
    if (!revealed || !note?.once) return;
    const t = setTimeout(() => {
      if (reduced) {
        setPhase("dead");
        return;
      }
      setIgnite(true);
      setPhase("burning");
      window.dispatchEvent(new Event("burnlink:burst"));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const words = gsap.utils.toArray<HTMLElement>(".burn-word");
          const tl = gsap.timeline({
            onComplete: () => setPhase("dead"),
          });
          tl.to(
            words,
            { color: EMBER_SOFT, duration: 0.25, stagger: 0.004 },
            0
          ).to(
            words,
            {
              y: () => -(70 + Math.random() * 180),
              x: () => (Math.random() - 0.5) * 140,
              opacity: 0,
              filter: "blur(6px)",
              duration: 1.0,
              ease: "power2.in",
              stagger: { each: 0.006, from: "random" },
            },
            0.25
          );
          if (cardRef.current) {
            tl.to(
              cardRef.current,
              { opacity: 0, scale: 0.97, duration: 0.4 },
              1.1
            );
          }
        })
      );
    }, READ_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [revealed, note, reduced]);

  // timed notes: tick down to $expiresAt, then the entity is gone
  useEffect(() => {
    if (secsLeft === null || phase !== "reading") return;
    if (secsLeft <= 0) {
      arkivPublic
        .getEntity(noteKey as `0x${string}`)
        .then(() => setSecsLeft(0))
        .catch(() => setPhase("gone"));
      return;
    }
    const t = setTimeout(() => setSecsLeft((v) => (v ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [secsLeft, phase, noteKey]);

  useEffect(() => {
    if ((phase === "gone" || phase === "dead") && !burnedBurstDone.current) {
      burnedBurstDone.current = true;
      window.dispatchEvent(new Event("burnlink:burst"));
    }
  }, [phase]);

  const liveText =
    phase === "loading"
      ? "Fetching the note from Arkiv."
      : phase === "no-key"
        ? "This link is missing its decryption key."
        : phase === "gone" || phase === "dead"
          ? "This note is gone."
          : phase === "burning"
            ? "The note is burning."
            : "The note is readable.";

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <EmberField />

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Burn<span className="text-primary">Link</span>
        </h1>
      </header>

      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>

      {phase === "loading" && (
        <div className="space-y-3">
          <p className="animate-ember inline-block rounded-lg border border-primary/40 bg-card/80 px-5 py-3 text-primary-mute">
            Breaking the seal…
          </p>
          <p className="text-xs text-subtle">
            Fetching ciphertext straight from the chain — no login, no
            permission.
          </p>
        </div>
      )}

      {phase === "no-key" && (
        <div className="space-y-3">
          <p className="text-xl font-semibold">No key in this link.</p>
          <p className="text-muted-foreground">
            BurnLink keys live after the <code>#</code>. Whoever shared this
            sent an incomplete link.
          </p>
        </div>
      )}

      {(phase === "gone" || phase === "dead") && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <p className="text-xl font-semibold text-primary-soft">
              This note is gone.
            </p>
            <p className="mt-2 text-muted-foreground">
              Burned after reading or expired by Entity Expiration — deleted by
              the Arkiv protocol, not by someone&apos;s promise. Nothing
              decryptable remains anywhere.
            </p>
          </div>
          {burnTx ? (
            <p className="text-xs text-subtle">
              Deletion tx:{" "}
              <a
                className={`font-mono underline transition hover:text-foreground ${FOCUS}`}
                href={`${EXPLORER}/tx/${burnTx}`}
                target="_blank"
                rel="noreferrer"
              >
                {burnTx}
              </a>
            </p>
          ) : phase === "dead" ? (
            <p className="text-xs text-subtle">
              Confirming deletion on-chain…
            </p>
          ) : null}
        </div>
      )}

      {(phase === "reading" || phase === "burning") && note && (
        <div className="space-y-6">
          {note.once && revealed && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
                {ignite ? "burning" : "this note burns after you read it"}
              </p>
              <div className="h-0.5 overflow-hidden rounded-full bg-border">
                {!ignite && (
                  <div className="animate-burnbar h-full bg-gradient-to-r from-primary to-ember" />
                )}
              </div>
            </div>
          )}

          <div
            ref={cardRef}
            className="relative rounded-lg border border-border bg-card/80 p-5 backdrop-blur-sm"
          >
            {ignite ? (
              <div className="pointer-events-none font-mono text-sm text-foreground">
                {note.text
                  .split(/\s+/)
                  .slice(0, 200)
                  .map((w, i) => (
                    <span key={i} className="burn-word inline-block">
                      {w}&nbsp;
                    </span>
                  ))}
              </div>
            ) : (
              <div className="whitespace-pre-wrap font-mono text-sm text-foreground">
                {revealed ? (
                  note.text
                ) : (
                  <ScrambleText
                    text={note.text}
                    speed={22}
                    per={Math.max(2, Math.ceil(note.text.length / 80))}
                    onDone={() => setRevealed(true)}
                  />
                )}
              </div>
            )}
          </div>

          {!note.once && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {secsLeft !== null ? (
                  <>
                    This note self-destructs in{" "}
                    <span className="font-mono text-primary-soft">
                      {secsLeft}s
                    </span>{" "}
                    — Entity Expiration, enforced by the protocol.
                  </>
                ) : (
                  "This note dies when its Arkiv entity expires — enforced by the protocol."
                )}
              </p>
              {secsLeft !== null && (
                <div className="h-0.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-ember transition-all duration-1000 ease-linear"
                    style={{
                      width: `${Math.min(100, (secsLeft / 30) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <details className="text-xs text-subtle">
            <summary className={`cursor-pointer rounded transition hover:text-foreground ${FOCUS}`}>
              on-chain proof
            </summary>
            <ul className="mt-2 space-y-1 break-all font-mono">
              <li>entity: {noteKey}</li>
              {note.creator && <li>created by: {note.creator}</li>}
              {note.expiresAt !== undefined && (
                <li>expires at block: {note.expiresAt.toString()}</li>
              )}
              <li>
                <a
                  className={`underline transition hover:text-foreground ${FOCUS}`}
                  href={`${EXPLORER}/address/${note.creator}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  creator on the Tiramisu explorer
                </a>
              </li>
            </ul>
          </details>
        </div>
      )}

      <footer className="mt-auto pt-16 text-xs text-subtle">
        <Link href="/" className={`rounded underline transition hover:text-foreground ${FOCUS}`}>
          BurnLink
        </Link>{" "}
        — notes that provably die on Arkiv.
      </footer>
    </main>
  );
}
