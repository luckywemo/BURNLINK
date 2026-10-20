import { arkivPublic } from "@/lib/arkiv-public";
import { str } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { decryptReply } from "@/lib/note-crypto";
import { audioSrc } from "@/lib/voice-note";

// A reply carries `from: "s" | "r"` so each side of the conversation can
// tell its own messages from the other party's. Entities missing the attr
// (older replies) read as the recipient's.
export type ChatMsg = { self: boolean; text: string; at: bigint; audio?: string };

export async function fetchReplyThread(
  noteKey: string,
  urlKey: string,
  side: "s" | "r"
): Promise<ChatMsg[]> {
  const page = await arkivPublic
    .select("*")
    .where(eq("replyto", str(noteKey)))
    .fetch();
  const out: ChatMsg[] = [];
  for (const e of page.entities) {
    try {
      const j = e.toJson() as { iv: string; ct: string };
      const text = await decryptReply(j.iv, j.ct, urlKey);
      const fromAttr = (
        e.attributes as Record<string, { value?: unknown }> | undefined
      )?.from;
      const from = typeof fromAttr?.value === "string" ? fromAttr.value : "r";
      const audio = audioSrc(text) ?? undefined;
      out.push({
        self: from === side,
        text: audio ? "voice note" : text,
        at: e.createdAt ?? BigInt(0),
        audio,
      });
    } catch {
      /* ciphertext that isn't ours to read — skip */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
