import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { c, font, shadow } from "../theme";
import { Backdrop, H1, Kicker, Sub, fadeUp, usePop } from "../ui";

const FRAME_W = 1320;
const IMG_H = 640;
// landing-scroll.jpg is the live landing page at 1440 px wide; scroll down to "Still pasting wallet addresses?"
const SCROLL_TO = Math.round((2420 * FRAME_W) / 1440);

export const OneLink: React.FC = () => {
  const frame = useCurrentFrame();
  const browserIn = usePop(10, 18);
  const scrollY = interpolate(frame, [40, 250], [0, SCROLL_TO], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40, paddingTop: 10 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={fadeUp(frame, 0)}>
            <Kicker style={{ alignSelf: "center" }}>One link</Kicker>
          </div>
          <H1 size={84} style={{ textAlign: "center", ...fadeUp(frame, 6) }}>
            One link, any token.
          </H1>
          <Sub style={{ textAlign: "center", ...fadeUp(frame, 14) }}>
            Every payment lands privately as BCH.
          </Sub>
        </div>

        <div
          style={{
            width: FRAME_W,
            borderRadius: 30,
            overflow: "hidden",
            background: "#fff",
            boxShadow: shadow.lift,
            opacity: browserIn,
            translate: `0px ${interpolate(browserIn, [0, 1], [80, 0])}px`,
            scale: `${interpolate(browserIn, [0, 1], [0.96, 1])}`,
          }}
        >
          <div
            style={{
              height: 52,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 22px",
              background: "#f4f5f8",
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            {["#ff5f57", "#febc2e", "#28c840"].map((col) => (
              <span key={col} style={{ width: 14, height: 14, borderRadius: 99, background: col }} />
            ))}
            <div
              style={{
                marginLeft: 18,
                height: 32,
                padding: "0 18px",
                borderRadius: 99,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                fontFamily: font.ui,
                fontSize: 19,
                color: c.ink10,
              }}
            >
              getunlinked.pages.dev/landing
            </div>
          </div>
          <div style={{ height: IMG_H, overflow: "hidden" }}>
            <Img src={staticFile("landing-scroll.jpg")} style={{ width: FRAME_W, display: "block", translate: `0px ${-scrollY}px` }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
