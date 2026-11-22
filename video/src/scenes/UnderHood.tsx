import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font, shadow } from "../theme";
import { Backdrop, Badge, Card, CountUp, H1, Kicker, Mono, Phase, Shot, fadeUp, fmt, short, usePop } from "../ui";

const sh = data.shield;
const st = data.stats;

const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const p = usePop(14, 20);
  const W = 1500;
  const H = Math.round((W * 1484) / 2934);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, ...fadeUp(frame, 0) }}>
        <Kicker style={{ alignSelf: "center" }}>Under the hood</Kicker>
        <H1 size={64}>Stealth addresses, then a zero-knowledge pool.</H1>
      </div>
      <div
        style={{
          opacity: p,
          translate: `0px ${interpolate(p, [0, 1], [70, 0])}px`,
          scale: `${interpolate(frame, [0, 80], [0.97, 1.02])}`,
        }}
      >
        <Shot src="deck-flow.png" width={W} height={H} radius={30} />
      </div>
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
        const start = 30 + i * 20;
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
        <Tile start={20} big={<CountUp to={st.constraints} start={24} dur={50} />} label="circuit constraints" />
        <Tile start={60} big={`~${st.poolTxKb} kB`} label={`per pool tx, fee about ${fmt(st.poolTxFeeSat)} sat`} />
        <Tile start={110} big="Groth16" label="verified in BCH Script, a SolidCash covenant" />
        <div style={{ fontSize: 25, color: c.ink10, padding: "4px 8px", ...fadeUp(frame, 200) }}>
          Proofs take {st.proofSeconds} s in the browser. Each verifier input uses {st.opCostBudget} of its op-cost budget.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const UnderHood: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: font.ui, color: c.ink12 }}>
    <Backdrop />
    <Phase from={0} dur={80} name="Deck flow">
      <Flow />
    </Phase>
    <Phase from={76} dur={369} name="Pool ledger" fadeOut={false}>
      <Pool />
    </Phase>
  </AbsoluteFill>
);
