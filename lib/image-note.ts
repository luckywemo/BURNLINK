// Image notes ride inside the same encrypted envelope as text: the image is
// downscaled + re-encoded as JPEG in the browser, wrapped in a tiny JSON
// envelope {"i":"data:..."}, and encrypted as the note plaintext. The chain
// only ever sees ciphertext — it can't tell an image note from a text note.
//
// Arkiv caps entity payloads near 128 KiB; the API enforces ct <= 80,000
// base64 chars (~60 KB plaintext). Base64 inflates ~4/3, so the data URL's
// base64 part must stay well under ~57k chars — 52k leaves comfortable room.

const MAX_IMG_B64 = 52_000;
const SMALL_FILE_KEEP = 36_000; // pass tiny files through untouched (animated gifs stay live)

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function renderJpeg(
  bmp: ImageBitmap,
  scale: number,
  q: number
): Promise<string> {
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("encode failed"));
        resolve(await fileToDataUrl(blob as File));
      },
      "image/jpeg",
      q
    );
  });
}

export async function imageToNoteDataUrl(file: File): Promise<string> {
  if (
    file.size <= SMALL_FILE_KEEP &&
    /^image\/(png|gif|webp|jpeg)$/.test(file.type)
  ) {
    const url = await fileToDataUrl(file);
    if (url.length - url.indexOf(",") - 1 <= MAX_IMG_B64) return url;
  }
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 960 / Math.max(bmp.width, bmp.height));
  let q = 0.8;
  let last = "";
  for (let i = 0; i < 10; i++) {
    last = await renderJpeg(bmp, scale, q);
    if (last.length - last.indexOf(",") - 1 <= MAX_IMG_B64) return last;
    if (q > 0.45) q -= 0.1;
    else {
      scale *= 0.75;
      q = 0.7;
    }
  }
  throw new Error("image too large");
}

// The plaintext sent through encryptNote. Text stays raw (backwards
// compatible with every existing link); images and voice notes get a JSON
// envelope — on-chain they're all just ciphertext.
export function notePlaintext(
  text: string,
  img: string | null,
  audio?: string | null
): string {
  if (img) return JSON.stringify({ i: img });
  if (audio) return JSON.stringify({ a: audio });
  return text;
}

// Inverse on the read side: try the media envelopes, else it's text.
export function splitNotePayload(raw: string): {
  text: string;
  img?: string;
  audio?: string;
} {
  if (raw.startsWith('{"i":"')) {
    try {
      const img = JSON.parse(raw).i;
      if (typeof img === "string" && img.startsWith("data:image/"))
        return { text: "", img };
    } catch {
      /* fall through — treat as text */
    }
  }
  if (raw.startsWith('{"a":"')) {
    try {
      const a = JSON.parse(raw).a;
      if (typeof a === "string" && a.startsWith("data:audio/"))
        return { text: "", audio: a };
    } catch {
      /* fall through — treat as text */
    }
  }
  return { text: raw };
}
