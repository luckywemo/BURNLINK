import { ImageResponse } from "next/og";

export const alt = "BurnLink — notes that provably die";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(160deg, #09090b 40%, #1c0d04 100%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Burn<span style={{ color: "#f97316" }}>Link</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 38, color: "#a1a1aa", maxWidth: 900 }}>
          Notes that provably die. Encrypted in your browser, deleted by the Arkiv protocol.
        </div>
        <div style={{ marginTop: 48, fontSize: 24, color: "#71717a" }}>
          Key lives in the link — never on a server.
        </div>
      </div>
    ),
    { ...size },
  );
}
