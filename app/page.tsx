"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { Flame, Copy, Check, ImagePlus, X, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import EmberField from "@/components/EmberField";
import ScrambleText from "@/components/ScrambleText";
import SealedCount from "@/components/SealedCount";
import NoteQR from "@/components/NoteQR";
import LampGlow from "@/components/LampGlow";
import CanvasReveal from "@/components/CanvasReveal";
import GlyphVeil from "@/components/GlyphVeil";
import { encryptNote, randomUrlToken, sha256b64, decryptReply, encryptReply } from "@/lib/note-crypto";
import { fetchReplyThread, type ChatMsg } from "@/lib/reply-thread";
import { startVoiceNote, audioEnvelope, type VoiceRecorder } from "@/lib/voice-note";
import { imageToNoteDataUrl, notePlaintext } from "@/lib/image-note";
import { arkivPublic } from "@/lib/arkiv-public";
import { getSessionWallet, sweepSessionGas } from "@/lib/ephemeral-wallet";
import { ExpirationTime, jsonToPayload, str } from "@arkiv-network/sdk";
import { i32 } from "@arkiv-network/sdk/attr";
import { eq } from "@arkiv-network/sdk/query";
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

const MIN_PW = 4;

// length + variety score → weak / medium / strong label shown while typing
function pwStrength(p: string): { label: string; cls: string; w: number } {
  let s = 0;
  if (p.length >= 4) s++;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[0-9]/.test(p) && /[a-zA-Z]/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p)) s++;
  if (p.length >= 4 && /\s/.test(p)) s++; // word phrases score well
  if (s <= 2) return { label: "weak", cls: "text-destructive", w: 33 };
  if (s <= 4) return { label: "medium", cls: "text-primary", w: 66 };
  return { label: "strong", cls: "text-emerald-400", w: 100 };
}

type Result = {
  link: string;
  txHash: string;
  expiresAt: string;
  pw: boolean;
  replies: boolean;
  msgTtl?: number;
  signer?: string;
};

export default function Home() {
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState(86400);
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState("45");
  const [customUnit, setCustomUnit] = useState(60);
  const [once, setOnce] = useState(true);
  const [usePw, setUsePw] = useState(false);
  const [pw, setPw] = useState("");
  const [allowReplies, setAllowReplies] = useState(true);
  const [msgTtl, setMsgTtl] = useState(86400);
  const [img, setImg] = useState<string | null>(null);
  const [imgName, setImgName] = useState("");
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [burning, setBurning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [retracted, setRetracted] = useState(false);
  const [retractBusy, setRetractBusy] = useState(false);
  const [replies, setReplies] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [recSecs, setRecSecs] = useState<number | null>(null);
  const recRef = useRef<VoiceRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [noteAudio, setNoteAudio] = useState<string | null>(null);
  const [noteRecSecs, setNoteRecSecs] = useState<number | null>(null);
  const noteRecRef = useRef<VoiceRecorder | null>(null);
  const noteRecTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [err, setErr] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { contextSafe } = useGSAP({ scope: headerRef });

  useGSAP(
    () => {
      if (reduced || !headerRef.current) return;
      gsap.from(headerRef.current.children, {
        y: 26,
        opacity: 0,
        duration: 0.9,
        stagger: 0.14,
        ease: "power3.out",
      });
    },
    { scope: headerRef, dependencies: [reduced] },
  );

  // While the sealed card is open, watch the chain for replies tagged
  // `replyto = <entity key>` and decrypt them with the link's fragment secret.
  useEffect(() => {
    if (!result || !result.replies) return;
    const key = result.link.match(/\/n\/(0x[0-9a-f]+)/)?.[1];
    const urlKey = result.link.match(/#k=([^&]+)/)?.[1];
    if (!key || !urlKey) return;
    let stop = false;
    const tick = async () => {
      try {
        const t = await fetchReplyThread(key, urlKey, "s");
        if (!stop) setReplies(t);
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
  }, [result]);

  function playBurnAnimation(): Promise<void> {
    if (reduced) return Promise.resolve();
    return new Promise((resolve) => {
      setBurning(true);
      window.dispatchEvent(new Event("burnlink:burst"));
      contextSafe(() =>
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
        )
      )();
      setTimeout(resolve, 2200); // hard cap — never hang the UX
    });
  }

  async function burn() {
    if ((!text.trim() && !img && !noteAudio) || busy) return;
    setBusy(true);
    setErr("");
    try {
      const apiCall = (async () => {
        const { iv, ct, urlKey } = await encryptNote(
          notePlaintext(text.trim(), img, noteAudio),
          usePw ? pw : undefined
        );
        const burnToken = randomUrlToken();
        const bh = await sha256b64(burnToken);
        // Prefer the session wallet: the entity is created and signed
        // client-side by a key this browser just generated. If the gas drip
        // hasn't landed (or fails), the shared relay signs instead.
        const sw = getSessionWallet();
        const funded = await Promise.race([
          sw.ensureFunded(),
          new Promise<false>((r) => setTimeout(() => r(false), 8000)),
        ]);
        if (funded) {
          try {
            const r = await sw.client.createEntity({
              payload: jsonToPayload({ v: 1, iv, ct, bh }),
              contentType: "application/json",
              attributes: {
                type: "burnlink",
                v: i32(1),
                mode: once ? "once" : "timed",
                ...(usePw ? { pw: i32(1) } : {}),
                ...(allowReplies ? { replies: i32(1) } : {}),
                ...(allowReplies ? { msgttl: i32(msgTtl) } : {}),
              },
              expires: ExpirationTime.fromSeconds(ttl),
            });
            void sweepSessionGas(); // return unused dust to the vault
            return {
              key: r.entityKey,
              txHash: r.txHash,
              expiresAt: r.expiresAt.toString(),
              urlKey,
              burnToken,
              signer: sw.address,
            };
          } catch {
            /* gas ran dry mid-session or RPC hiccup — relay takes it */
          }
        }
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            iv,
            ct,
            ttl,
            once,
            bh,
            pw: usePw,
            replies: allowReplies,
            msgttl: allowReplies ? msgTtl : undefined,
          }),
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
        pw: usePw,
        replies: allowReplies,
        msgTtl: allowReplies ? msgTtl : undefined,
        signer: out.signer,
      });
    } catch {
      setErr("Could not seal the note. Try again.");
    } finally {
      setBusy(false);
      setBurning(false);
    }
  }

  // Sender's side of the on-chain chat: a burnlink-reply entity tagged with
  // `from: "s"`, encrypted to the same link-derived key the recipient uses.
  async function postChat(payload: string, preview: ChatMsg) {
    if (!result || chatBusy) return;
    const key = result.link.match(/\/n\/(0x[0-9a-f]+)/)?.[1];
    const urlKey = result.link.match(/#k=([^&]+)/)?.[1];
    if (!key || !urlKey) return;
    setChatBusy(true);
    try {
      const { iv, ct } = await encryptReply(payload, urlKey);
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iv,
          ct,
          ttl: result.msgTtl ?? 86400,
          once: false,
          replyTo: key,
          from: "s",
        }),
      });
      if (!r.ok) throw new Error();
      setReplies((c) => [...c, preview]);
    } catch {
      /* next poll will show the truth */
    }
    setChatBusy(false);
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    await postChat(msg, { self: true, text: msg, at: BigInt(Date.now()) });
    setChatInput("");
  }

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
      }
      return;
    }
    try {
      recRef.current = await startVoiceNote();
    } catch {
      return; // mic permission denied — stay quiet, text still works
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

  // Voice note as the note itself: mic → recording pill → preview → seal.
  // The audio replaces the textarea content, exactly like an image note.
  async function toggleNoteRecord() {
    if (noteRecRef.current) {
      const rec = noteRecRef.current;
      noteRecRef.current = null;
      if (noteRecTimerRef.current) clearInterval(noteRecTimerRef.current);
      noteRecTimerRef.current = null;
      setNoteRecSecs(null);
      const dataUrl = await rec.stop();
      if (dataUrl) setNoteAudio(dataUrl);
      else setErr("Voice note ran past the size cap — keep it under ~15s.");
      return;
    }
    try {
      noteRecRef.current = await startVoiceNote();
      getSessionWallet().ensureFunded(); // recording = intent to seal
    } catch {
      setErr("Mic permission denied — type your note instead.");
      return;
    }
    setNoteRecSecs(0);
    const t0 = Date.now();
    noteRecTimerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (s >= 15) {
        toggleNoteRecord();
      } else {
        setNoteRecSecs(s);
      }
    }, 250);
  }

  function cancelNoteRecord() {
    noteRecRef.current?.cancel();
    noteRecRef.current = null;
    if (noteRecTimerRef.current) clearInterval(noteRecTimerRef.current);
    noteRecTimerRef.current = null;
    setNoteRecSecs(null);
  }

  const segmentCls = (active: boolean) =>
    `flex h-11 items-center px-3 font-mono text-xs transition ${FOCUS} ${
      active
        ? "bg-primary text-primary-foreground shadow-[0_0_16px_rgba(249,115,22,0.45)]"
        : "text-muted-foreground hover:bg-border hover:text-foreground"
    }`;

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-16">
      <EmberField />

      <header ref={headerRef} className="relative mb-10 text-center">
        <LampGlow />
        <CanvasReveal />
        <p className="relative flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          <Flame size={16} aria-hidden className="animate-flicker" />
          <span className="relative">
            {"BURNLINK".split("").map((ch, i) => (
              <span
                key={i}
                aria-hidden
                className="logo-burn"
                style={{ animationDelay: `${i * 0.14}s` }}
              >
                {ch}
              </span>
            ))}
            <span className="sr-only">BurnLink</span>
            {[18, 40, 62, 84].map((left, i) => (
              <span
                key={left}
                aria-hidden
                className="logo-ember"
                style={{
                  left: `${left}%`,
                  animationDelay: `${i * 0.45}s`,
                  ["--dx" as string]: `${(i % 2 === 0 ? 1 : -1) * (4 + i * 2)}px`,
                }}
              />
            ))}
          </span>
        </p>
        <h1 className="relative mt-4 overflow-hidden text-[clamp(2rem,5.4vw,2.6rem)] font-bold leading-[1.08] tracking-tight sm:whitespace-nowrap">
          A note that{" "}
          <span className="burn-text font-serif italic tracking-normal">
            <ScrambleText text="provably dies." speed={26} per={3} />
          </span>
        </h1>
        <p className="relative mx-auto mt-4 max-w-lg text-muted-foreground">
          Encrypted in your browser, stored as an Arkiv entity, deleted by the
          protocol — not by a promise.
        </p>
        <p className="relative mt-3 text-xs text-subtle">
          <SealedCount />
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {busy ? "Sealing your note on-chain." : ""}
        {result ? "Note sealed. Link generated." : ""}
        {err}
      </div>

      {!result ? (
        <div key="compose" className="space-y-5">
          <div
            ref={composerRef}
            className="beam relative rounded-lg transition-shadow duration-300 focus-within:shadow-[0_0_50px_rgba(249,115,22,0.18)]"
          >
            <label htmlFor="note" className="sr-only">
              Note text
            </label>
            {noteAudio ? (
              <div className="relative rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm">
                <audio controls src={noteAudio} className="w-full" />
                <button
                  type="button"
                  aria-label="Remove voice note"
                  onClick={() => setNoteAudio(null)}
                  className={`absolute right-2 top-2 rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive ${FOCUS}`}
                >
                  <X size={14} aria-hidden />
                </button>
                <p className="mt-2 px-1 font-mono text-[10px] text-subtle">
                  voice note — encrypted as an audio note, burns like the rest
                </p>
              </div>
            ) : noteRecSecs !== null ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card/80 px-4 py-8 backdrop-blur-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive"
                />
                <span className="font-mono text-xs text-foreground">
                  recording… 0:{String(noteRecSecs).padStart(2, "0")} / 0:15
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={toggleNoteRecord}
                  aria-label="Stop recording"
                  title="stop — preview the voice note"
                  className={`rounded-md border border-primary/50 p-1.5 text-primary transition hover:bg-primary/15 ${FOCUS}`}
                >
                  <Square size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={cancelNoteRecord}
                  aria-label="Discard recording"
                  title="discard"
                  className={`rounded-md border border-border p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive ${FOCUS}`}
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            ) : img ? (
              <div className="relative rounded-lg border border-border bg-card/80 p-3 backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt="Attached image preview"
                  className="mx-auto max-h-64 rounded-md"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => {
                    setImg(null);
                    setImgName("");
                  }}
                  className={`absolute right-2 top-2 rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive ${FOCUS}`}
                >
                  <X size={14} aria-hidden />
                </button>
                <p className="mt-2 truncate px-1 font-mono text-[10px] text-subtle">
                  {imgName} — encrypted as an image note
                </p>
              </div>
            ) : (
              <textarea
                id="note"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // first keystroke = intent to seal — start the gas drip now
                  // so it's confirmed long before the user hits Seal
                  getSessionWallet().ensureFunded();
                }}
                rows={6}
                maxLength={12000}
                placeholder="Type something that shouldn't live forever…"
                className={`w-full rounded-lg border border-border bg-card/80 p-4 pb-8 font-mono text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-subtle focus:border-primary/60 ${
                  burning ? "opacity-0" : ""
                }`}
              />
            )}
            {!img && !noteAudio && noteRecSecs === null && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={imgBusy}
                  title="attach an image note"
                  aria-label="Attach image"
                  className={`absolute bottom-2 left-3 rounded-md p-1 transition ${FOCUS} ${
                    imgBusy
                      ? "animate-pulse text-primary"
                      : "text-muted-foreground/70 hover:text-primary"
                  }`}
                >
                  <ImagePlus size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={toggleNoteRecord}
                  title="record a voice note — up to 15s"
                  aria-label="Record a voice note"
                  className={`absolute bottom-2 left-9 rounded-md p-1 text-muted-foreground/70 transition hover:text-primary ${FOCUS}`}
                >
                  <Mic size={15} aria-hidden />
                </button>
              </>
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[10px] text-subtle/70"
            >
              {img
                ? "image · aes-256-gcm"
                : noteAudio
                  ? "voice · aes-256-gcm"
                  : text.length > 0
                    ? `${text.length.toLocaleString()} chars`
                    : "aes-256-gcm"}
            </span>
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
                  <Input
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
                    className="w-20 px-2 py-1.5 text-xs"
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setImgBusy(true);
                setErr("");
                try {
                  setImg(await imageToNoteDataUrl(f));
                  setImgName(f.name);
                } catch {
                  setErr(
                    "That image can't fit a note even compressed — try a smaller one."
                  );
                }
                setImgBusy(false);
              }}
            />
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={usePw}
                onChange={(e) => setUsePw(e.target.checked)}
                className="accent-orange-500"
              />
              require passphrase
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={allowReplies}
                onChange={(e) => setAllowReplies(e.target.checked)}
                className="accent-orange-500"
              />
              allow replies
            </label>
            {allowReplies && (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span id="msgttl-label">msgs burn</span>
                <div
                  role="group"
                  aria-labelledby="msgttl-label"
                  className="flex flex-wrap overflow-hidden rounded-lg border border-border bg-card/80"
                >
                  {TTLS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={msgTtl === t.value}
                      onClick={() => setMsgTtl(t.value)}
                      className={segmentCls(msgTtl === t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {usePw && (
            <div className="space-y-1.5">
              <Input
                type="text"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={`passphrase (${MIN_PW}+ chars — a short phrase beats symbols)`}
                aria-label="Passphrase"
                className="font-mono text-sm"
              />
              {pw.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full transition-all ${
                        pwStrength(pw).label === "weak"
                          ? "bg-destructive"
                          : pwStrength(pw).label === "medium"
                            ? "bg-primary"
                            : "bg-emerald-400"
                      }`}
                      style={{ width: `${pwStrength(pw).w}%` }}
                    />
                  </div>
                  <span className={`text-xs ${pwStrength(pw).cls}`}>
                    {pwStrength(pw).label}
                  </span>
                  {pw.length < MIN_PW && (
                    <span className="text-xs text-subtle">
                      · {MIN_PW - pw.length} more chars needed
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-subtle">
                Share the passphrase separately — it&apos;s never in the link
                or on-chain.
              </p>
            </div>
          )}

          <div className="beam beam-btn rounded-lg">
            <Button
              onClick={burn}
              disabled={
                busy ||
                (!text.trim() && !img && !noteAudio) ||
                (usePw && pw.length < MIN_PW)
              }
              size="lg"
              className="w-full"
            >
              <Flame size={18} aria-hidden />
              {busy ? "Sealing…" : "Seal & burn"}
            </Button>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}

          <section aria-label="How it works" className="pt-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((s) => (
                <Card
                  key={s.n}
                  className="bg-card/60 p-4 transition hover:border-primary/40"
                >
                  <p className="font-mono text-xs text-primary">{s.n}</p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {s.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div key="result" ref={resultRef} className="animate-rise space-y-5">
          <Card className="animate-ember relative overflow-hidden border-primary/50 p-6">
            <GlyphVeil />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
                sealed — your link is forged
              </p>
              {/* link is unselectable while it scrambles — a mid-animation
                  drag-copy produces a damaged key. Copy button + QR carry the
                  real value. */}
              <div
                aria-label={result.link}
                className="mt-3 select-none break-all font-mono text-sm leading-relaxed text-primary-mute"
              >
                <ScrambleText text={result.link} speed={18} per={4} />
              </div>
              <p className="mt-3 text-xs text-subtle">
                The decryption key lives after the <code>#</code> — it never
                touched a server or the chain. Share it with the{" "}
                <span className="text-foreground">Copy link</span> button or the
                QR below.
                {result.pw &&
                  " The note is also sealed behind your passphrase — share it separately."}
              </p>
              <div className="mt-4 flex items-center gap-4">
                <NoteQR value={result.link} />
                <p className="text-xs leading-relaxed text-subtle">
                  Scan to hand the link to a nearby device — the QR is
                  generated locally and carries the key with it.
                </p>
              </div>
              {result.replies && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-soft">
                  chat — on-chain, encrypted to this link
                </p>
                <p className="mt-1 text-[11px] text-subtle">
                  every message burns {(result.msgTtl ?? 86400) < 60 ? `${result.msgTtl}s` : (result.msgTtl ?? 86400) < 3600 ? `${(result.msgTtl ?? 86400) / 60} min` : (result.msgTtl ?? 86400) < 86400 ? `${(result.msgTtl ?? 86400) / 3600}h` : `${(result.msgTtl ?? 86400) / 86400}d`} after sending — one by one, on-chain
                </p>
                {replies.length === 0 ? (
                  <p className="mt-2 text-xs text-subtle">
                    Keep this page open — when the recipient writes back, it
                    decrypts here. Nothing is stored off-chain.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {replies.map((r, i) => (
                      <li
                        key={i}
                        className={`animate-rise max-w-[85%] rounded-md border px-3 py-2 font-mono text-xs ${
                          r.self
                            ? "ml-auto border-primary/40 bg-primary/10 text-foreground"
                            : "border-border bg-background/60 text-foreground"
                        }`}
                      >
                        <span className="mb-0.5 block text-[10px] uppercase tracking-widest text-subtle">
                          {r.self ? "you" : "them"}
                        </span>
                        {r.audio ? (
                          <audio controls src={r.audio} className="h-8 max-w-[220px]" />
                        ) : (
                          r.text
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {recSecs !== null ? (
                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-primary/50 bg-background/60 px-3 py-2">
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
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="write back — encrypted to this link"
                      aria-label="Chat with recipient"
                      maxLength={500}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendChat();
                      }}
                      className={`flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground outline-none transition placeholder:text-subtle focus:border-primary/60 ${FOCUS}`}
                    />
                    {chatInput.trim() ? (
                      <button
                        type="button"
                        onClick={sendChat}
                        disabled={chatBusy}
                        className={`rounded-lg border border-primary/50 px-4 font-mono text-xs text-primary-soft transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50 ${FOCUS}`}
                      >
                        {chatBusy ? "…" : "send"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={toggleRecord}
                        disabled={chatBusy}
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
              )}
            </div>
          </Card>

          <Button
            onClick={() => {
              navigator.clipboard.writeText(result.link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full"
          >
            {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>

          {result.signer ? (
            <p className="font-mono text-[11px] text-subtle">
              signed by your session wallet{" "}
              <span className="text-primary-soft">
                {result.signer.slice(0, 10)}…{result.signer.slice(-6)}
              </span>{" "}
              — this browser holds the key, nothing else does
            </p>
          ) : (
            <p className="font-mono text-[11px] text-subtle">
              signed by the shared BurnLink relay — your note is unlinkable to
              you by design
            </p>
          )}
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
          <div className="flex items-center gap-4">
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => {
                setResult(null);
                setText("");
                setImg(null);
                setImgName("");
                setRetracted(false);
              }}
            >
              write another
            </Button>
            {!retracted ? (
              <Button
                variant="link"
                className="h-auto p-0 text-destructive hover:text-destructive/80"
                disabled={retractBusy}
                onClick={async () => {
                  if (retractBusy) return;
                  setRetractBusy(true);
                  try {
                    const m = result.link.match(/\/n\/(0x[0-9a-f]+)#.*&b=([^&\s]+)/);
                    if (m) {
                      await fetch(`/api/notes/${m[1]}/burn`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ b: m[2] }),
                      });
                    }
                    setRetracted(true);
                  } catch {
                    setRetracted(true);
                  }
                  setRetractBusy(false);
                }}
              >
                {retractBusy ? "burning…" : "retract — burn it now"}
              </Button>
            ) : (
              <span className="text-xs text-destructive">
                burned — the link is dead.
              </span>
            )}
          </div>
        </div>
      )}

      <footer className="mt-auto pt-16 text-xs text-subtle">
        <p>
          Ciphertext lives on the Tiramisu testnet as a public, encrypted Arkiv
          entity. The decryption key exists only in the link fragment. When the
          entity dies — by reading or by Entity Expiration — nothing readable
          is left anywhere.
        </p>
        <a
          href="https://github.com/luckywemo/BURNLINK"
          target="_blank"
          rel="noreferrer"
          className={`mt-4 inline-flex items-center gap-1.5 rounded transition hover:text-foreground ${FOCUS}`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          source on GitHub — MIT
        </a>
      </footer>
    </main>
  );
}
