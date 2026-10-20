"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/lib/gsap";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import EmberField from "@/components/EmberField";
import ScrambleText from "@/components/ScrambleText";
import { arkivPublic } from "@/lib/arkiv-public";
import { decryptNote, encryptReply } from "@/lib/note-crypto";
import { fetchReplyThread, type ChatMsg } from "@/lib/reply-thread";
import { startVoiceNote, audioEnvelope, type VoiceRecorder } from "@/lib/voice-note";
import { Mic, Square } from "lucide-react";
import { splitNotePayload } from "@/lib/image-note";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { EMBER_SOFT } from "@/lib/tokens";

type Phase =
  | "loading"
  | "no-key"
  | "locked"
  | "error"
  | "gone"
  | "reading"
  | "burning"
  | "dead";

const EXPLORER = "https://tiramisu.explorer.arkiv.network";
const READ_SECONDS = 4.5; // how long the note stays readable before igniting

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70";

export default function NoteClient({ noteKey }: { noteKey: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState<{
    text: string;
    img?: string;
    audio?: string;
    once: boolean;
    allowReplies: boolean;
    msgTtl: number;
    creator?: string;
    expiresAt?: bigint;
  } | null>(null);
  const [burnTx, setBurnTx] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [ignite, setIgnite] = useState(false);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [burnBusy, setBurnBusy] = useState(false);
  const [extBusy, setExtBusy] = useState<number | null>(null);
  const [extMsg, setExtMsg] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [urlKey, setUrlKey] = useState("");
  const [recSecs, setRecSecs] = useState<number | null>(null);
  const recRef = useRef<VoiceRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<{
    parsed: { v: number; iv: string; ct: string };
    urlKey: string;
    burnToken: string;
    once: boolean;
    allowReplies: boolean;
    msgTtl: number;
    creator?: string;
    expiresAt?: bigint;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const burnedBurstDone = useRef(false);
  const reduced = useReducedMotion();
  const { contextSafe } = useGSAP();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const urlKey = hash.get("k");
      const burnToken = hash.get("b") ?? "";
      setUrlKey(urlKey ?? "");
      if (!urlKey) {
        setPhase("no-key");
        return;
      }
      // Fresh entities take a while to appear on the read path — a
      // just-sealed note can hang getEntity for tens of seconds while the
      // indexer catches up. Poll patiently; only give up after ~60s, and
      // distinguish "the store keeps saying absent" (gone) from "the RPC
      // never answered" (error).
      let entity;
      let rejects = 0;
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        try {
          const e = await Promise.race([
            arkivPublic.getEntity(noteKey as `0x${string}`),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("fetch-timeout")), 12_000)
            ),
          ]);
          if (e) {
            entity = e;
            break;
          }
          rejects++; // absent — could be indexer lag, keep polling
          if (rejects >= 4) {
            setPhase("gone");
            return;
          }
        } catch (e) {
          if (!(e instanceof Error && e.message === "fetch-timeout")) {
            rejects++;
            if (rejects >= 4) {
              setPhase("gone");
              return;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 2500));
        if (cancelled) return;
      }
      if (!entity) {
        setPhase(rejects > 0 ? "gone" : "error");
        return;
      }
      if (cancelled) return;

      let parsed: { v: number; iv: string; ct: string };
      try {
        parsed = entity.toJson() as typeof parsed;
      } catch {
        setPhase("error");
        return;
      }
      const modeAttr = entity.attributes?.mode as
        | { value?: string }
        | undefined;
      const pwAttr = entity.attributes?.pw as { value?: number } | undefined;
      const repliesAttr = entity.attributes?.replies as
        | { value?: number }
        | undefined;
      const msgTtlAttr = entity.attributes?.msgttl as
        | { value?: number }
        | undefined;
      const once = (modeAttr?.value ?? "timed") === "once";

      pendingRef.current = {
        parsed,
        urlKey,
        burnToken,
        once,
        allowReplies: repliesAttr?.value === 1,
        msgTtl:
          typeof msgTtlAttr?.value === "number" ? msgTtlAttr.value : 86400,
        creator: entity.creator,
        expiresAt: entity.expiresAt,
      };

      if (pwAttr?.value === 1) {
        setPhase("locked");
        return;
      }
      const ok = await openSeal();
      // a present-but-wrong key fails GCM — don't spin "breaking" forever
      if (ok === false) setPhase("error");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey]);

  // decrypt + reveal; on success for once-notes the real deletion fires.
  // A wrong passphrase throws inside decryptNote (GCM auth fails) — the
  // entity is never touched, so a wrong guess can't burn the note.
  async function openSeal(passphrase?: string) {
    const p = pendingRef.current;
    if (!p) return;
    try {
      const text = await decryptNote(p.parsed.iv, p.parsed.ct, p.urlKey, passphrase);
      const { text: body, img, audio } = splitNotePayload(text);
      setNote({
        text: body,
        img,
        audio,
        once: p.once,
        allowReplies: p.allowReplies,
        msgTtl: p.msgTtl,
        creator: p.creator,
        expiresAt: p.expiresAt,
      });
      setPhase("reading");

      if (!p.once && p.expiresAt !== undefined) {
        try {
          const t = await arkivPublic.getBlockTiming();
          setSecsLeft(
            Math.max(0, Number(p.expiresAt - t.currentBlock) * 2)
          );
        } catch {
          /* countdown is cosmetic */
        }
      }

      if (p.once) {
        // fire the real on-chain deletion shortly after the reveal starts —
        // the visuals lag behind, the delete does not
        setTimeout(async () => {
          try {
            const r = await fetch(`/api/notes/${noteKey}/burn`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ b: p.burnToken }),
            });
            const { txHash } = await r.json();
            setBurnTx(txHash);
          } catch {
            /* deletion races are fine — entity is gone either way */
          }
        }, 1200);
      }
      return true;
    } catch {
      return false;
    }
  }

  // after the scramble reveal, once-notes count down then ignite
  useEffect(() => {
    if (!revealed || !note?.once) return;
    const t = setTimeout(
      contextSafe(() => {
        if (reduced) {
          // reduced-motion: brief fade instead of the full scatter
          setIgnite(true);
          setPhase("burning");
          setTimeout(() => setPhase("dead"), 450);
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
      }),
      READ_SECONDS * 1000
    );
    return () => clearTimeout(t);
  }, [revealed, note, reduced, contextSafe]);

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

  // The recipient's side of the chat: poll reply entities tagged `replyto`
  // and decrypt with the link-derived key — works even after the note burns,
  // since replies are their own entities with their own lifetimes.
  useEffect(() => {
    if (!urlKey) return;
    let stop = false;
    const tick = async () => {
      try {
        const t = await fetchReplyThread(noteKey, urlKey, "r");
        if (!stop) setChat(t);
      } catch {
        /* query hiccup — retry next tick */
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [noteKey, urlKey]);

  useEffect(() => {
    if ((phase === "gone" || phase === "dead") && !burnedBurstDone.current) {
      burnedBurstDone.current = true;
      window.dispatchEvent(new Event("burnlink:burst"));
    }
  }, [phase]);

  // Holder-initiated actions on a live timed note. Both require the burn
  // capability token from the URL fragment — the API refuses without it.
  async function burnNow() {
    const p = pendingRef.current;
    if (!p || burnBusy) return;
    setBurnBusy(true);
    try {
      const r = await fetch(`/api/notes/${noteKey}/burn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ b: p.burnToken }),
      });
      const { txHash } = await r.json();
      if (txHash) setBurnTx(txHash);
    } catch {
      /* entity may already be gone — same end state */
    }
    setPhase("dead");
  }

  async function extendFuse(addSecs: number) {
    const p = pendingRef.current;
    if (!p || extBusy !== null) return;
    setExtBusy(addSecs);
    setExtMsg("");
    try {
      const r = await fetch(`/api/notes/${noteKey}/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ b: p.burnToken, addSecs }),
      });
      const out = await r.json();
      if (r.ok && out.expiresAt) {
        const at = BigInt(out.expiresAt);
        p.expiresAt = at;
        setNote((n) => (n ? { ...n, expiresAt: at } : n));
        setSecsLeft((v) => (v === null ? null : v + addSecs));
        setExtMsg(`fuse extended — expires near block ${at}`);
      } else {
        setExtMsg("the chain refused the extension");
      }
    } catch {
      setExtMsg("the chain refused the extension");
    }
    setExtBusy(null);
  }

  // Reply: a fresh entity tagged `replyto` = this note's key, encrypted to a
  // key derived from the link fragment — readable only by link-holders.
  // Reply: a fresh entity tagged `replyto` = this note's key and `from` = "r",
  // encrypted to a key derived from the link fragment — readable only by
  // link-holders. Messages flow both ways; this is one side of the thread.
  async function postChat(payload: string, preview: ChatMsg) {
    const p = pendingRef.current;
    if (!p || replyBusy) return;
    setReplyBusy(true);
    try {
      const { iv, ct } = await encryptReply(payload, p.urlKey);
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iv,
          ct,
          ttl: p.msgTtl,
          once: false,
          replyTo: noteKey,
          from: "r",
        }),
      });
      if (!r.ok) throw new Error();
      setChat((c) => [...c, preview]);
    } catch {
      setExtMsg("reply failed — try again");
    }
    setReplyBusy(false);
  }

  async function sendReply() {
    const msg = replyText.trim();
    if (!msg) return;
    await postChat(msg, { self: true, text: msg, at: BigInt(Date.now()) });
    setReplyText("");
  }

  // Voice note: 15s cap, encrypted inside the same envelope — the chain
  // sees only ciphertext, identical to any other message.
  async function toggleRecord() {
    if (recRef.current) {
      const rec = recRef.current;
      recRef.current = null;
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      recTimerRef.current = null;
      setRecSecs(null);
      const dataUrl = await rec.stop();
      if (dataUrl) {
        await postChat(audioEnvelope(dataUrl), {
          self: true,
          text: "voice note",
          at: BigInt(Date.now()),
          audio: dataUrl,
        });
      } else {
        setExtMsg("voice note too big for an entity — keep it shorter");
      }
      return;
    }
    try {
      recRef.current = await startVoiceNote();
    } catch {
      setExtMsg("mic unavailable — permission denied?");
      return;
    }
    setRecSecs(0);
    const t0 = Date.now();
    recTimerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (s >= 15) {
        toggleRecord();
      } else {
        setRecSecs(s);
      }
    }, 250);
  }

  const fmtMsgTtl = (s: number) =>
    s < 60 ? `${s}s` : s < 3600 ? `${s / 60} min` : s < 86400 ? `${s / 3600}h` : `${s / 86400}d`;

  const replyBlock = (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
        chat — on-chain, encrypted to this link
      </p>
      <p className="text-[11px] text-subtle">
        messages burn {fmtMsgTtl(pendingRef.current?.msgTtl ?? 86400)} after
        sending — deleted by the protocol, one by one
      </p>
      {chat.length > 0 && (
        <ul className="space-y-2">
          {chat.map((m, i) => (
            <li
              key={i}
              className={`animate-rise max-w-[85%] rounded-md border px-3 py-2 font-mono text-xs text-foreground ${
                m.self
                  ? "ml-auto border-primary/40 bg-primary/10"
                  : "border-border bg-background/60"
              }`}
            >
              <span className="mb-0.5 block text-[10px] uppercase tracking-widest text-subtle">
                {m.self ? "you" : "sender"}
              </span>
              {m.audio ? (
                <audio controls src={m.audio} className="h-8 max-w-[220px]" />
              ) : (
                m.text
              )}
            </li>
          ))}
        </ul>
      )}
      {recSecs !== null ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/50 bg-card/80 px-3 py-2">
          <span className="animate-pulse font-mono text-xs text-destructive">●</span>
          <span className="flex-1 font-mono text-xs text-primary-soft">
            recording… 0:{String(recSecs).padStart(2, "0")} / 0:15
          </span>
          <button
            type="button"
            onClick={toggleRecord}
            aria-label="Stop and send voice note"
            className={`rounded-md border border-primary/50 p-1.5 text-primary-soft transition hover:bg-primary hover:text-primary-foreground ${FOCUS}`}
          >
            <Square size={13} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="write back — encrypted to this link"
            aria-label="Reply to sender"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendReply();
            }}
            className={`flex-1 rounded-lg border border-border bg-card/80 px-3 py-2 font-mono text-sm text-foreground outline-none transition placeholder:text-subtle focus:border-primary/60 ${FOCUS}`}
          />
          {replyText.trim() ? (
            <button
              type="button"
              onClick={sendReply}
              disabled={replyBusy}
              className={`rounded-lg border border-primary/50 px-4 font-mono text-xs text-primary-soft transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50 ${FOCUS}`}
            >
              {replyBusy ? "…" : "send"}
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleRecord}
              disabled={replyBusy}
              aria-label="Record a voice note"
              title="record a voice note (15s max)"
              className={`rounded-lg border border-primary/50 px-3.5 text-primary-soft transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50 ${FOCUS}`}
            >
              <Mic size={15} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const liveText =
    phase === "loading"
      ? "Fetching the note from Arkiv."
      : phase === "locked"
        ? "This note is sealed behind a passphrase."
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
          <span className="animate-flicker">Burn</span>
          <span className="text-primary">Link</span>
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
          <div className="space-y-2 pt-2" aria-hidden>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <p className="text-xs text-subtle">
            Fetching ciphertext straight from the chain — no login, no
            permission.
          </p>
        </div>
      )}

      {phase === "locked" && (
        <Card className="space-y-4 border-primary/40 bg-card/80 p-6">
          <p className="text-xl font-semibold">This note is passphrase-sealed.</p>
          <p className="text-sm text-muted-foreground">
            The link alone isn&apos;t enough — the sender shares the passphrase
            separately.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pwInput || pwBusy) return;
              setPwBusy(true);
              setPwErr(false);
              const ok = await openSeal(pwInput);
              setPwBusy(false);
              if (!ok) setPwErr(true);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              value={pwInput}
              onChange={(e) => {
                setPwInput(e.target.value);
                setPwErr(false);
              }}
              placeholder="passphrase"
              aria-label="Passphrase"
              autoFocus
              className={`w-full rounded-lg border bg-card/80 p-3 font-mono text-sm text-foreground outline-none transition placeholder:text-subtle ${FOCUS} ${
                pwErr ? "border-destructive" : "border-border"
              }`}
            />
            {pwErr && (
              <p className="text-sm text-destructive">
                That passphrase didn&apos;t work — the seal holds. Try again.
              </p>
            )}
            <div className="beam beam-btn rounded-lg">
              <button
                type="submit"
                disabled={pwBusy || !pwInput}
                className={`w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-soft disabled:opacity-50 ${FOCUS}`}
              >
                {pwBusy ? "Breaking the seal…" : "Break the seal"}
              </button>
            </div>
          </form>
        </Card>
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

      {phase === "error" && (
        <div className="space-y-3">
          <p className="text-xl font-semibold">Couldn&apos;t break the seal.</p>
          <p className="text-muted-foreground">
            The link looks damaged — maybe it was copied before the text
            finished resolving, or the network didn&apos;t answer in time.
            Get a fresh copy of the full link and try again.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/50 px-4 py-2 font-mono text-xs text-primary-soft transition hover:bg-primary hover:text-primary-foreground ${FOCUS}`}
          >
            try again
          </button>
        </div>
      )}

      {(phase === "gone" || phase === "dead") && (
        <div className="space-y-4">
          <Card className="bg-card/60 p-6">
            <p className="text-xl font-semibold text-primary-soft">
              This note is gone.
            </p>
            <p className="mt-2 text-muted-foreground">
              Burned after reading or expired by Entity Expiration — deleted by
              the Arkiv protocol, not by someone&apos;s promise. Nothing
              decryptable remains anywhere.
            </p>
          </Card>
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
          {phase === "dead" &&
            (pendingRef.current?.allowReplies || chat.length > 0) &&
            replyBlock}
          {phase === "gone" && chat.length > 0 && replyBlock}
          <Link
            href="/"
            className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/50 px-4 py-2 font-mono text-xs text-primary-soft transition hover:bg-primary hover:text-primary-foreground ${FOCUS}`}
          >
            pass it on — seal your own note →
          </Link>
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

          <Card
            ref={cardRef}
            className={`relative p-5 ${ignite && reduced ? "animate-fadeburn" : ""}`}
          >
            {note.audio ? (
              <>
                <audio
                  controls
                  src={note.audio}
                  onCanPlay={() => setRevealed(true)}
                  className="w-full"
                />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
                  voice note — decrypted in this tab only
                </p>
              </>
            ) : note.img ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={note.img}
                  alt="Encrypted image note"
                  onLoad={() => setRevealed(true)}
                  className={`mx-auto max-h-[60vh] rounded-md transition-opacity duration-500 ${ignite ? "opacity-100" : ""}`}
                />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
                  image note — decrypted in this tab only
                </p>
              </>
            ) : ignite ? (
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
          </Card>

          {!note.once && phase === "reading" && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-subtle">
              <span>you hold the fuse:</span>
              <button
                type="button"
                onClick={() => extendFuse(300)}
                disabled={extBusy !== null}
                className={`rounded underline transition hover:text-foreground disabled:opacity-50 ${FOCUS}`}
              >
                {extBusy === 300 ? "extending…" : "+5 min"}
              </button>
              <button
                type="button"
                onClick={() => extendFuse(3600)}
                disabled={extBusy !== null}
                className={`rounded underline transition hover:text-foreground disabled:opacity-50 ${FOCUS}`}
              >
                {extBusy === 3600 ? "extending…" : "+1 hour"}
              </button>
              <button
                type="button"
                onClick={burnNow}
                disabled={burnBusy}
                className={`rounded text-destructive underline transition hover:text-foreground disabled:opacity-50 ${FOCUS}`}
              >
                {burnBusy ? "burning…" : "burn it now"}
              </button>
              {extMsg && <span className="text-subtle">{extMsg}</span>}
            </div>
          )}

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

          {phase === "reading" && (note.allowReplies || chat.length > 0) && replyBlock}

          <Link
            href="/"
            className={`inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] text-subtle transition hover:border-primary/60 hover:text-primary-soft ${FOCUS}`}
          >
            pass it on — seal your own note →
          </Link>
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
