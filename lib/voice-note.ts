"use client";

// Voice notes ride inside the same encrypted envelope as text: the plaintext
// of a voice message is a JSON wrapper {"a":"data:audio/webm;base64,…"}.
// On-chain it's indistinguishable from a text message — same ciphertext.
const MIME = "audio/webm;codecs=opus";
const BITRATE = 24_000; // ~45KB at 15s — fits the entity payload cap
const MAX_BYTES = 60_000;

export type VoiceRecorder = {
  stop: () => Promise<string | null>; // resolves data URL or null if oversized
  cancel: () => void;
};

// Starts recording immediately. Caller shows the countdown UI and calls
// stop() on release/auto-timeout.
export async function startVoiceNote(): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(MIME) ? MIME : undefined,
    audioBitsPerSecond: BITRATE,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start(250);

  const finish = () =>
    new Promise<Blob>((res) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        res(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      rec.stop();
    });

  return {
    async stop() {
      const blob = await finish();
      if (blob.size > MAX_BYTES) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      return `data:${blob.type};base64,${btoa(bin)}`;
    },
    cancel() {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export function audioEnvelope(dataUrl: string): string {
  return JSON.stringify({ a: dataUrl });
}

export function audioSrc(plaintext: string): string | null {
  if (!plaintext.startsWith('{"a":')) return null;
  try {
    const a = (JSON.parse(plaintext) as { a?: string }).a;
    return typeof a === "string" && a.startsWith("data:audio/") ? a : null;
  } catch {
    return null;
  }
}
