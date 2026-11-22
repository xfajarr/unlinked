import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { c, font, r, shadow } from "./theme";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const lerp = (
  frame: number,
  input: [number, number],
  output: [number, number],
) => interpolate(frame, input, output, { ...clamp, easing: ease });

/** Opacity + upward slide entrance. */
export const fadeUp = (
  frame: number,
  start: number,
  dur = 26,
  dist = 36,
): React.CSSProperties => ({
  opacity: interpolate(frame, [start, start + dur * 0.7], [0, 1], clamp),
  translate: `0px ${interpolate(frame, [start, start + dur], [dist, 0], { ...clamp, easing: ease })}px`,
});

export const usePop = (start: number, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping, mass: 0.8 } });
};

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const short = (h: string, a = 8, b = 6) => {
  const s = h.replace(/^bitcoincash:/, "");
  return `${s.slice(0, a)}…${s.slice(-b)}`;
};

export const CountUp: React.FC<{
  from?: number;
  to: number;
  start: number;
  dur?: number;
  format?: (n: number) => string;
}> = ({ from = 0, to, start, dur = 40, format = fmt }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [start, start + dur], [from, to], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(v)}</span>;
};

/** Soft app-like backdrop: white ground with slow drifting blue glows. */
export const Backdrop: React.FC<{ tone?: "light" | "blue" }> = ({ tone = "light" }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  if (tone === "blue") {
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${70 + drift / 20}% 10%, #4f86ff 0%, ${c.blue9} 45%, ${c.blue11} 100%)`,
        }}
      />
    );
  }
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #ffffff 0%, #f3f5fa 100%)" }}>
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: 9999,
          right: -380 + drift,
          top: -520,
          background: "radial-gradient(closest-side, rgba(37,99,255,0.10), rgba(37,99,255,0))",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: 9999,
          left: -360 - drift,
          bottom: -520,
          background: "radial-gradient(closest-side, rgba(37,99,255,0.07), rgba(37,99,255,0))",
        }}
      />
    </AbsoluteFill>
  );
};

/** A timed sub-section of a scene that fades out at its end. */
export const Phase: React.FC<{
  from: number;
  dur: number;
  name: string;
  fadeOut?: boolean;
  children: React.ReactNode;
}> = ({ from, dur, name, fadeOut = true, children }) => (
  <Sequence from={from} durationInFrames={dur} name={name}>
    <PhaseFade dur={dur} fadeOut={fadeOut}>
      {children}
    </PhaseFade>
  </Sequence>
);

const PhaseFade: React.FC<{ dur: number; fadeOut: boolean; children: React.ReactNode }> = ({
  dur,
  fadeOut,
  children,
}) => {
  const frame = useCurrentFrame();
  const out = fadeOut ? interpolate(frame, [dur - 16, dur], [1, 0], clamp) : 1;
  const lift = fadeOut ? interpolate(frame, [dur - 16, dur], [0, -24], clamp) : 0;
  return (
    <AbsoluteFill style={{ opacity: out, translate: `0px ${lift}px` }}>{children}</AbsoluteFill>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      height: 56,
      padding: "0 26px 0 20px",
      borderRadius: 999,
      background: c.blue3,
      color: c.blue11,
      fontFamily: font.ui,
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: "-0.01em",
      alignSelf: "flex-start",
      ...style,
    }}
  >
    <span style={{ width: 12, height: 12, borderRadius: 99, background: c.blue9 }} />
    {children}
  </div>
);

export const H1: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  children,
  size = 84,
  style,
}) => (
  <div
    style={{
      fontFamily: font.ui,
      fontSize: size,
      lineHeight: 1.06,
      fontWeight: 650,
      letterSpacing: "-0.035em",
      color: c.ink12,
      textWrap: "balance",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Sub: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      fontFamily: font.ui,
      fontSize: 40,
      lineHeight: 1.3,
      fontWeight: 500,
      letterSpacing: "-0.015em",
      color: c.ink11,
      textWrap: "pretty",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Mono: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <span style={{ fontFamily: font.mono, letterSpacing: "-0.01em", ...style }}>{children}</span>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      background: c.surface,
      borderRadius: r.card,
      boxShadow: shadow.card,
      ...style,
    }}
  >
    {children}
  </div>
);

/** A real screenshot in a rounded frame. */
export const Shot: React.FC<{
  src: string;
  width: number;
  height: number;
  radius?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ src, width, height, radius = 28, style, children }) => (
  <div
    style={{
      position: "relative",
      width,
      height,
      borderRadius: radius,
      overflow: "hidden",
      boxShadow: shadow.lift,
      background: "#fff",
      ...style,
    }}
  >
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
    {children}
  </div>
);

/**
 * Marks an element in a screenshot (box in %). "click": a pointer glides in and clicks it once.
 * "circle": a line draws around it once. Neither repeats, so nothing pulses.
 */
export const Ring: React.FC<{
  left: number;
  top: number;
  w: number;
  h: number;
  start: number;
  radius?: number;
  color?: string;
  mode?: "click" | "circle";
}> = ({ left, top, w, h, start, radius = 999, color = c.blue9, mode = "click" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - start;
  if (t < 0) return null;
  const cx = left + w / 2;
  const cy = top + h / 2;

  if (mode === "circle") {
    const draw = interpolate(t, [0, 22], [0, 360], { ...clamp, easing: ease });
    const mask = `conic-gradient(from -90deg, #000 ${draw}deg, transparent ${draw}deg)`;
    return (
      <div
        style={{
          position: "absolute",
          left: `${left - 1.4}%`,
          top: `${top - 2.4}%`,
          width: `${w + 2.8}%`,
          height: `${h + 4.8}%`,
          borderRadius: radius,
          border: `4px solid ${color}`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    );
  }

  const move = spring({ frame: t, fps, config: { damping: 200 }, durationInFrames: 24 });
  const x = interpolate(move, [0, 1], [cx + 16, cx]);
  const y = interpolate(move, [0, 1], [cy + 26, cy]);
  const appear = interpolate(t, [0, 8], [0, 1], clamp);
  const press = interpolate(t, [26, 30, 35], [1, 0.8, 1], clamp);
  const ripple = interpolate(t, [27, 50], [0, 1], { ...clamp, easing: ease });
  const tipX = (4 / 24) * 48;
  const tipY = (2 / 24) * 48;
  return (
    <>
      {t >= 27 && (
        <div
          style={{
            position: "absolute",
            left: `${cx}%`,
            top: `${cy}%`,
            width: 130,
            height: 130,
            marginLeft: -65,
            marginTop: -65,
            borderRadius: "50%",
            border: `4px solid ${color}`,
            opacity: 1 - ripple,
            scale: `${0.15 + ripple * 0.85}`,
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: 48,
          height: 48,
          marginLeft: -tipX,
          marginTop: -tipY,
          opacity: appear,
          transform: `scale(${press})`,
          transformOrigin: `${tipX}px ${tipY}px`,
          filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.35))",
        }}
      >
        <path d="M4 2 L4 19 L8.6 14.6 L11.6 21.4 L14.4 20.2 L11.4 13.6 L18 13.6 Z" fill="#fff" stroke="#0b0d14" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </>
  );
};

export const LogoMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect width="64" height="64" rx="20" fill={c.blue9} />
    <g
      fill="none"
      stroke="#fff"
      strokeWidth="4.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(14 14) scale(1.5)"
    >
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" x2="8" y1="2" y2="5" />
      <line x1="2" x2="5" y1="8" y2="8" />
      <line x1="16" x2="16" y1="19" y2="22" />
      <line x1="19" x2="22" y1="16" y2="16" />
    </g>
  </svg>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: "green" | "blue" | "grey" | "amber";
  style?: React.CSSProperties;
}> = ({ children, tone = "green", style }) => {
  const map = {
    green: [c.green3, c.green11],
    blue: [c.blue3, c.blue11],
    grey: [c.well, c.ink11],
    amber: [c.amber3, c.amber11],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 44,
        padding: "0 18px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: font.ui,
        fontSize: 24,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
};

/** Left text column + right visual, the default two-up scene layout. */
export const TwoUp: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: number;
  gap?: number;
}> = ({ left, right, leftWidth = 700, gap = 90 }) => (
  <AbsoluteFill
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 130px",
      gap,
    }}
  >
    <div style={{ width: leftWidth, display: "flex", flexDirection: "column", gap: 28 }}>{left}</div>
    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
      {right}
    </div>
  </AbsoluteFill>
);
