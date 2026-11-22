import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { c, font } from "../theme";
import { Backdrop, LogoMark, Phase, ease, fadeUp, usePop } from "../ui";

const LINE_1 = ["A", "public", "payment", "address"];
const LINE_2 = ["is", "a", "window", "into", "your", "wallet."];

const Words: React.FC<{ words: string[]; start: number; highlight?: string }> = ({
  words,
  start,
  highlight,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: "0 0.26em", justifyContent: "center", flexWrap: "wrap" }}>
      {words.map((w, i) => {
        const s = start + i * 5;
        const isHi = w === highlight;
        const wipe = interpolate(frame, [s + 26, s + 44], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        });
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", ...fadeUp(frame, s, 24, 50) }}>
            {isHi ? (
              <span
                style={{
                  position: "absolute",
                  left: -14,
                  right: -14,
                  top: "8%",
                  bottom: "2%",
                  borderRadius: 22,
                  background: c.blue3,
                  scale: `${wipe} 1`,
                  transformOrigin: "left center",
                }}
              />
            ) : null}
            <span style={{ position: "relative", color: isHi ? c.blue9 : c.ink12 }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

const Statement: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 48 }}>
      <div
        style={{
          fontFamily: font.ui,
          fontSize: 112,
          lineHeight: 1.08,
          fontWeight: 650,
          letterSpacing: "-0.04em",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Words words={LINE_1} start={8} />
        <Words words={LINE_2} start={30} highlight="window" />
      </div>
      <div
        style={{
          fontFamily: font.ui,
          fontSize: 42,
          fontWeight: 500,
          color: c.ink10,
          letterSpacing: "-0.015em",
          ...fadeUp(frame, 92, 26, 24),
        }}
      >
        Whoever has it can see what you received and what you hold.
      </div>
    </AbsoluteFill>
  );
};

const Brand: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(4, 13);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 44 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <div style={{ scale: `${pop}`, rotate: `${interpolate(pop, [0, 1], [-25, 0])}deg` }}>
          <LogoMark size={168} />
        </div>
        <div
          style={{
            fontFamily: font.ui,
            fontSize: 150,
            fontWeight: 650,
            letterSpacing: "-0.05em",
            color: c.ink12,
            opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            translate: `${interpolate(frame, [14, 44], [-60, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })}px 0px`,
          }}
        >
          unlinked
        </div>
      </div>
      <div
        style={{
          fontFamily: font.ui,
          fontSize: 54,
          fontWeight: 550,
          letterSpacing: "-0.025em",
          color: c.ink11,
          ...fadeUp(frame, 38, 28, 30),
        }}
      >
        Private payment links on <span style={{ color: c.blue9 }}>Bitcoin Cash</span>
      </div>
    </AbsoluteFill>
  );
};

export const Hook: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <Phase from={0} dur={232} name="Statement">
      <Statement />
    </Phase>
    <Phase from={228} dur={72} name="Brand" fadeOut={false}>
      <Brand />
    </Phase>
  </AbsoluteFill>
);
