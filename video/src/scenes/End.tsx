import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font } from "../theme";
import { Backdrop, LogoMark, fadeUp, usePop } from "../ui";

const LINKS = [
  { label: "App", url: data.links.app },
  { label: "Code", url: data.links.repo },
  { label: "Deck", url: data.links.deck },
];

export const End: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(4, 14);
  return (
    <AbsoluteFill style={{ fontFamily: font.ui }}>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 54 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ scale: `${pop}` }}>
            <LogoMark size={120} />
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 650,
              letterSpacing: "-0.05em",
              color: c.ink12,
              opacity: interpolate(frame, [10, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            unlinked
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 980 }}>
          {LINKS.map((l, i) => (
            <div
              key={l.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                height: 92,
                padding: "0 34px",
                borderRadius: 24,
                background: "#fff",
                boxShadow: "0 0 0 1px rgba(15,20,40,0.09)",
                ...fadeUp(frame, 30 + i * 10, 26, 30),
              }}
            >
              <span style={{ width: 110, fontSize: 30, fontWeight: 600, color: c.ink10 }}>{l.label}</span>
              <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", color: c.blue9 }}>{l.url}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            height: 72,
            padding: "0 36px",
            borderRadius: 999,
            background: c.ink12,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            ...fadeUp(frame, 80, 26, 24),
          }}
        >
          Built for BCH BLAZE 2026
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
