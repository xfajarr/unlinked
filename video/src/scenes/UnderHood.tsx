import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font, shadow } from "../theme";
import { Backdrop, Badge, Card, CountUp, H1, Kicker, Mono, Phase, ease, fadeUp, fmt, short, usePop } from "../ui";

const sh = data.shield;
const st = data.stats;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// cubic bezier length by sampling, good enough for beam dash math
const bezLen = (p: number[]) => {
  let len = 0;
  let [px, py] = [p[0], p[1]];
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    len += Math.hypot(x - px, y - py);
    [px, py] = [x, y];
  }
  return len;
};
const line = (x1: number, y1: number, x2: number, y2: number) => ({ d: `M ${x1} ${y1} L ${x2} ${y2}`, len: Math.hypot(x2 - x1, y2 - y1) });
const curve = (...p: number[]) => ({ d: `M ${p[0]} ${p[1]} C ${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`, len: bezLen(p) });

const DRAW = 16;
// beat (scene frames) when each node pops; an edge starts 12 frames before its target node
const AT = { payer: 8, addr: 32, app: 56, pool: 80, bal: 104, out: 128 };
// narration: "Under the hood," then a pause while the flow builds, then the pool's parts as they are named
const SAY = { groth: 155, verifier: 292, covenant: 370 };

const EDGES = [
  { ...line(550, 400, 750, 400), start: AT.addr - 12 },
  { ...line(1150, 400, 1350, 400), start: AT.app - 12 },
  { ...line(1550, 495, 1550, 588), start: AT.pool - 12 },
  { ...line(1258, 750, 1152, 750), start: AT.bal - 12 },
  { ...curve(748, 750, 655, 750, 655, 672, 562, 672), start: AT.out - 12 },
  { ...curve(748, 750, 655, 750, 655, 828, 562, 828), start: AT.out - 8 },
];

const Edge: React.FC<{ d: string; len: number; start: number }> = ({ d, len, start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  if (t < 0) return null;
  const draw = interpolate(t, [0, DRAW], [0, 1], { ...clamp, easing: ease });
  const seg = 80;
  const p = (t % 54) / 54;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={c.blue6}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
        markerEnd={draw > 0.97 ? "url(#hood-arrow)" : undefined}
      />
      <path
        d={d}
        fill="none"
        stroke={c.blue9}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${seg} ${len + seg}`}
        strokeDashoffset={seg - p * (len + seg)}
        style={{ filter: "drop-shadow(0 0 8px rgba(37,99,255,0.9))" }}
      />
    </g>
  );
};

const FlowNode: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  title: string;
  sub: string;
  accent?: string;
  children?: React.ReactNode;
}> = ({ x, y, w, h, start, title, sub, accent = c.blue9, children }) => {
  const frame = useCurrentFrame();
  const p = usePop(start, 16);
  const lit = interpolate(frame, [start, start + 14], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        padding: "24px 28px",
        borderRadius: 26,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: `0 0 0 ${1 + lit * 1.5}px ${lit > 0.5 ? accent : "rgba(15,20,40,0.1)"}, 0 30px 70px -30px rgba(15,30,80,0.25)`,
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.85, 1])}`,
      }}
    >
      <span style={{ fontSize: 32, fontWeight: 650, letterSpacing: "-0.02em", color: c.ink12 }}>{title}</span>
      <span style={{ fontSize: 23, lineHeight: 1.35, color: c.ink11 }}>{sub}</span>
      {children}
    </div>
  );
};

const Part: React.FC<{ start: number; children: React.ReactNode }> = ({ start, children }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 600, color: c.blue11, ...fadeUp(frame, start, 20, 16) }}>
      <span style={{ width: 12, height: 12, borderRadius: 99, background: c.blue9, flex: "none" }} />
      <span>{children}</span>
    </div>
  );
};

const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const group = interpolate(frame, [AT.pool - 10, AT.pool + 10], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 28, ...fadeUp(frame, 0) }}>
        <Kicker style={{ alignSelf: "center" }}>Under the hood</Kicker>
        <H1 size={60}>Stealth addresses, then a zero-knowledge pool.</H1>
      </div>

      <div
        style={{
          position: "absolute",
          left: 110,
          top: 560,
          width: 1740,
          height: 380,
          borderRadius: 36,
          border: `3px dashed ${c.blue6}`,
          background: "rgba(234,240,255,0.45)",
          opacity: group,
        }}
      />
      <div style={{ position: "absolute", left: 150, top: 540, opacity: group }}>
        <Badge tone="blue" style={{ background: "#fff", boxShadow: `0 0 0 2px ${c.blue6}` }}>
          Zero-knowledge pool
        </Badge>
      </div>

      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="hood-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c.blue9} />
          </marker>
        </defs>
        {EDGES.map((e) => (
          <Edge key={e.d} d={e.d} len={e.len} start={e.start} />
        ))}
      </svg>

      <FlowNode x={160} y={315} w={380} h={170} start={AT.payer} title="Payer" sub="any BCH wallet, or USDT, ETH, SOL through NEAR" />
      <FlowNode x={760} y={315} w={380} h={170} start={AT.addr} title="One-time address" sub="made from your public keys, not linked to you" />
      <FlowNode x={1360} y={315} w={380} h={170} start={AT.app} title="Your app" sub="scans the board and finds the payment" />
      <FlowNode x={1270} y={598} w={560} h={308} start={AT.pool} accent={c.green11} title="Unlinked Shield" sub="the pool, live on BCH mainnet">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          <Part start={SAY.groth}>
            Groth16, <CountUp to={st.constraints} start={SAY.groth} dur={60} /> constraints
          </Part>
          <Part start={SAY.verifier}>Verifier written in BCH Script</Part>
          <Part start={SAY.covenant}>Pool covenant in SolidCash</Part>
        </div>
      </FlowNode>
      <FlowNode x={760} y={665} w={380} h={170} start={AT.bal} accent={c.green11} title="Private balance" sub="notes only you can spend" />
      <FlowNode x={150} y={605} w={400} h={130} start={AT.out} title="Pay @bob privately" sub="sender, receiver, amount hidden" />
      <FlowNode x={150} y={765} w={400} h={130} start={AT.out + 4} title="Withdraw anywhere" sub="to any BCH address" />
    </AbsoluteFill>
  );
};

const Ledger: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Card style={{ width: 1010, padding: "30px 30px 18px", boxShadow: shadow.lift, ...fadeUp(frame, 8, 28, 40) }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0 8px 18px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 40, fontWeight: 650, letterSpacing: "-0.025em" }}>Unlinked Shield pool</span>
          <Mono style={{ fontSize: 25, color: c.ink10 }}>{short(sh.pool, 12, 8)}</Mono>
        </div>
        <Badge tone="green">BCH mainnet, {sh.history.length} txs</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "250px 230px 150px 1fr", padding: "0 8px 10px", fontSize: 22, color: c.ink9, fontWeight: 600 }}>
        <span>Step</span>
        <span>Tx</span>
        <span style={{ textAlign: "right" }}>Size</span>
        <span style={{ textAlign: "right" }}>Pool value, sat</span>
      </div>
      {sh.history.map((h, i) => {
        const start = 14 + i * 12;
        const isLast = i === sh.history.length - 1;
        return (
          <div
            key={h.txid}
            style={{
              display: "grid",
              gridTemplateColumns: "250px 230px 150px 1fr",
              alignItems: "center",
              padding: "16px 8px",
              borderTop: `1px solid ${c.line}`,
              background: isLast ? "#f5f8ff" : "transparent",
              borderRadius: isLast ? 16 : 0,
              fontSize: 28,
              ...fadeUp(frame, start, 22, 20),
            }}
          >
            <span style={{ fontWeight: 600, color: isLast ? c.blue11 : c.ink12 }}>{h.label}</span>
            <Mono style={{ fontSize: 25, color: c.blue10 }}>{short(h.txid, 8, 4)}</Mono>
            <span style={{ textAlign: "right", fontFamily: font.num, color: c.ink11 }}>{fmt(h.sizeBytes)} B</span>
            <span style={{ textAlign: "right", fontFamily: font.num, fontWeight: 600 }}>
              <span style={{ color: c.ink9 }}>{fmt(h.poolBefore)} → </span>
              <span style={{ color: h.poolAfter >= h.poolBefore ? c.green11 : c.ink12 }}>{fmt(h.poolAfter)}</span>
            </span>
          </div>
        );
      })}
    </Card>
  );
};

const Tile: React.FC<{ start: number; big: React.ReactNode; label: string }> = ({ start, big, label }) => {
  const frame = useCurrentFrame();
  return (
    <Card style={{ padding: "26px 30px", display: "flex", flexDirection: "column", gap: 6, ...fadeUp(frame, start, 26, 30) }}>
      <span style={{ fontFamily: font.num, fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em", color: c.ink12, whiteSpace: "nowrap" }}>
        {big}
      </span>
      <span style={{ fontSize: 26, color: c.ink11, lineHeight: 1.3 }}>{label}</span>
    </Card>
  );
};

const Pool: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 110px" }}>
      <Ledger />
      <div style={{ width: 590, display: "flex", flexDirection: "column", gap: 18 }}>
        <Tile start={6} big={fmt(st.constraints)} label="circuit constraints" />
        <Tile start={14} big={`~${st.poolTxKb} kB`} label={`per pool tx, fee about ${fmt(st.poolTxFeeSat)} sat`} />
        <Tile start={22} big="Groth16" label="verified in BCH Script, a SolidCash covenant" />
        <div style={{ fontSize: 25, color: c.ink10, padding: "4px 8px", ...fadeUp(frame, 70) }}>
          Proofs take {st.proofSeconds} s in the browser. Each verifier input uses {st.opCostBudget} of its op-cost budget.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const UnderHood: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: font.ui, color: c.ink12 }}>
    <Backdrop />
    <Phase from={0} dur={432} name="Node flow">
      <Flow />
    </Phase>
    <Phase from={428} dur={142} name="Pool ledger" fadeOut={false}>
      <Pool />
    </Phase>
  </AbsoluteFill>
);
