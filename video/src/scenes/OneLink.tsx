import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font, shadow } from "../theme";
import { Backdrop, H1, Kicker, Sub, ease, fadeUp, usePop } from "../ui";

const FRAME_W = 1320;
const IMG_H = Math.round((FRAME_W * 1080) / 2880);

const LinkIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const OneLink: React.FC = () => {
  const frame = useCurrentFrame();
  const browserIn = usePop(30, 20);
  const pillIn = usePop(250, 16);
  const url = data.links.profile;
  const typed = Math.floor(
    interpolate(frame, [262, 262 + url.length * 1.6], [0, url.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const zoom = interpolate(frame, [30, 480], [1, 1.06]);

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
            <Img
              src={staticFile("landing.png")}
              style={{ width: FRAME_W, height: IMG_H, scale: `${zoom}`, transformOrigin: "50% 40%" }}
            />
          </div>
        </div>

        <div
          style={{
            height: 84,
            minWidth: 640,
            padding: "0 36px 0 28px",
            borderRadius: 999,
            background: c.ink12,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: font.ui,
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            opacity: pillIn,
            scale: `${interpolate(pillIn, [0, 1], [0.8, 1])}`,
            translate: `0px ${interpolate(pillIn, [0, 1], [30, 0], { easing: ease })}px`,
            boxShadow: shadow.lift,
          }}
        >
          <LinkIcon size={34} color={c.blue6} />
          <span>
            {url.slice(0, typed)}
            <span style={{ opacity: typed < url.length || Math.floor(frame / 15) % 2 === 0 ? 1 : 0, color: c.blue6 }}>|</span>
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
