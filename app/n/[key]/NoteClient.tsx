"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import EmberField from "@/components/EmberField";
import { arkivPublic } from "@/lib/arkiv-public";
import { decryptNote } from "@/lib/note-crypto";

type State =
  | { kind: "loading" }
  | { kind: "no-key" }
  | { kind: "burned" }
  | {
      kind: "open";
      text: string;
      once: boolean;
      creator?: string;
      expiresAt?: bigint;
      burnTx?: string;
    };

const EXPLORER = "https://tiramisu.explorer.arkiv.network";

export default function NoteClient({ noteKey }: { noteKey: string }) {
  const [s, setS] = useState<State>({ kind: "loading" });
  const noteRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const urlKey = hash.get("k");
      const burnToken = hash.get("b") ?? "";
      if (!urlKey) {
        setS({ kind: "no-key" });
        return;
      }
      let entity;
      try {
        entity = await arkivPublic.getEntity(noteKey as `0x${string}`);
      } catch {
        setS({ kind: "burned" });
        return;
      }
      if (cancelled) return;

      const parsed = entity.toJson() as { v: number; iv: string; ct: string };
      const text = await decryptNote(parsed.iv, parsed.ct, urlKey);
      const modeAttr = entity.attributes?.mode as
        | { value?: string }
        | undefined;
      const mode = modeAttr?.value ?? "timed";

      const base = {
        kind: "open" as const,
        text,
        once: mode === "once",
        creator: entity.creator,
        expiresAt: entity.expiresAt,
      };

      if (mode === "once") {
        // reveal first, burn a beat later — the user must see the note
        setS(base);
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const r = await fetch(`/api/notes/${noteKey}/burn`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ b: burnToken }),
          });
          const { txHash } = await r.json();
          if (!cancelled) {
            window.dispatchEvent(new Event("burnlink:burst"));
            setS({ ...base, burnTx: txHash });
          }
        } catch {
          if (!cancelled) setS(base);
        }
      } else if (!cancelled) {
        setS(base);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteKey]);

  // reveal animation when the note opens
  useEffect(() => {
    if (s.kind === "open" && noteRef.current) {
      gsap.from(noteRef.current, {
        opacity: 0,
        y: 14,
        duration: 0.6,
        ease: "power2.out",
      });
    }
  }, [s.kind]);

  // scorch the card + slide the banner in once the burn tx lands
  const burned = s.kind === "open" && !!s.burnTx;
  useEffect(() => {
    if (burned) {
      if (noteRef.current) {
        gsap.to(noteRef.current, {
          borderColor: "#f97316",
          boxShadow: "0 0 60px rgba(249,115,22,0.35)",
          duration: 0.5,
          yoyo: true,
          repeat: 1,
          ease: "power2.inOut",
        });
      }
      if (bannerRef.current) {
        gsap.from(bannerRef.current, {
          opacity: 0,
          y: -10,
          duration: 0.6,
          ease: "power3.out",
        });
      }
    }
  }, [burned]);

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <EmberField />

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Burn<span className="text-orange-500">Link</span>
        </h1>
      </header>

      {s.kind === "loading" && (
        <p className="text-zinc-400">Fetching ciphertext from Arkiv…</p>
      )}

      {s.kind === "no-key" && (
        <div className="space-y-3">
          <p className="text-xl font-semibold">No key in this link.</p>
          <p className="text-zinc-400">
            BurnLink keys live after the <code>#</code>. Whoever shared this
            sent an incomplete link.
          </p>
        </div>
      )}

      {s.kind === "burned" && (
        <div className="space-y-3">
          <p className="text-xl font-semibold text-orange-400">
            This note is gone.
          </p>
          <p className="text-zinc-400">
            Burned after reading or expired by Entity Expiration — deleted by
            the Arkiv protocol, not by someone&apos;s promise. Nothing
            decryptable remains on any server.
          </p>
        </div>
      )}

      {s.kind === "open" && (
        <div className="space-y-6">
          {s.once && (
            <div
              ref={bannerRef}
              className={`rounded-lg border p-4 text-sm transition-colors ${
                s.burnTx
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
            >
              {s.burnTx ? (
                <>
                  This note has been burned. Reload this link — it will be
                  gone. Deletion tx:{" "}
                  <a
                    className="underline"
                    href={`${EXPLORER}/tx/${s.burnTx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.burnTx.slice(0, 18)}…
                  </a>
                </>
              ) : (
                "Read it once — this note is burning…"
              )}
            </div>
          )}

          <div
            ref={noteRef}
            className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-zinc-100"
          >
            {s.text}
          </div>

          {!s.once && (
            <p className="text-sm text-zinc-400">
              This note dies when its Arkiv entity expires — enforced by the
              protocol.
            </p>
          )}

          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-300">
              on-chain proof
            </summary>
            <ul className="mt-2 space-y-1 break-all font-mono">
              <li>entity: {noteKey}</li>
              {s.creator && <li>created by: {s.creator}</li>}
              {s.expiresAt !== undefined && (
                <li>expires at block: {s.expiresAt.toString()}</li>
              )}
              <li>
                <a
                  className="underline hover:text-zinc-300"
                  href={`${EXPLORER}/address/${s.creator}`}
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

      <footer className="mt-auto pt-16 text-xs text-zinc-600">
        <Link href="/" className="underline hover:text-zinc-400">
          BurnLink
        </Link>{" "}
        — notes that provably die on Arkiv.
      </footer>
    </main>
  );
}
