import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font, shadow } from "../theme";
import {
  Backdrop,
  Badge,
  Card,
  CountUp,
  H1,
  Kicker,
  Mono,
  Phase,
  Shot,
  Sub,
  TwoUp,
  ease,
  fadeUp,
  fmt,
  short,
  usePop,
} from "../ui";

const as = data.shield.autoShield;

const Balance: React.FC = () => {
  const frame = useCurrentFrame();
  const p = usePop(10, 18);
  const W = 1000;
  const H = Math.round((W * 316) / 726);
  return (
    <TwoUp
      leftWidth={640}
      left={
        <>
          <div style={fadeUp(frame, 0)}>
            <Kicker>Private by default</Kicker>
          </div>
          <H1 style={fadeUp(frame, 6)}>Money arrives, then goes private on its own.</H1>
          <Sub style={fadeUp(frame, 14)}>@xfajarr's real balance on mainnet.</Sub>
        </>
      }
      right={
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ opacity: p, scale: `${interpolate(p, [0, 1], [0.92, 1])}` }}>
            <Shot src="balance.png" width={W} height={H} radius={40} />
          </div>
          <Meaning start={30} tone="green" label="Private">
            in the shielded pool. No one can trace it.
          </Meaning>
          <Meaning start={46} tone="amber" label="Arriving">
            just landed. It turns private on its own.
          </Meaning>
        </div>
      }
    />
  );
};

const Meaning: React.FC<{ start: number; tone: "green" | "amber"; label: string; children: React.ReactNode }> = ({
  start,
  tone,
  label,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, paddingLeft: 8, fontSize: 30, color: c.ink11, ...fadeUp(frame, start, 22, 20) }}>
      <Badge tone={tone} style={{ height: 50, fontSize: 27, minWidth: 150, justifyContent: "center" }}>
        {label}
      </Badge>
      <span>{children}</span>
    </div>
  );
};

const Node: React.FC<{
  start: number;
  active: number;
  title: string;
  value: React.ReactNode;
  unit?: string;
  foot: React.ReactNode;
  tone: "grey" | "blue" | "green";
}> = ({ start, active, title, value, unit, foot, tone }) => {
  const frame = useCurrentFrame();
  const on = interpolate(frame, [active, active + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = tone === "green" ? c.green11 : c.blue9;
  return (
    <Card
      style={{
        width: 470,
        padding: "34px 34px 30px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: `0 0 0 ${1 + on * 2}px ${on > 0.01 ? ring : "rgba(15,20,40,0.09)"}, 0 30px 70px -30px rgba(15,30,80,${0.15 + on * 0.15})`,
        ...fadeUp(frame, start, 26, 40),
      }}
    >
      <Badge tone={tone} style={{ alignSelf: "flex-start" }}>
        {title}
      </Badge>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: font.num, fontSize: 64, fontWeight: 650, letterSpacing: "-0.03em", color: c.ink12 }}>
          {value}
        </span>
        {unit ? <span style={{ fontSize: 30, color: c.ink9, fontWeight: 600 }}>{unit}</span> : null}
      </div>
      <div style={{ fontSize: 26, color: c.ink11, lineHeight: 1.35 }}>{foot}</div>
    </Card>
  );
};

const Arrow: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <div style={{ width: 90, height: 8, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 9, background: c.wellStrong }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${t * 100}%`, borderRadius: 9, background: c.blue9 }} />
      <div
        style={{
          position: "absolute",
          top: -8,
          left: `calc(${t * 100}% - 12px)`,
          width: 24,
          height: 24,
          borderRadius: 99,
          background: c.blue9,
          boxShadow: "0 0 0 8px rgba(37,99,255,0.18)",
          opacity: t > 0 && t < 1 ? 1 : 0,
        }}
      />
    </div>
  );
};

const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        <H1 size={76} style={{ textAlign: "center", ...fadeUp(frame, 0) }}>
          Visible on chain, then private. Automatically.
        </H1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Node
          start={24}
          active={36}
          tone="grey"
          title="1. Visible on chain"
          value={<CountUp to={as.shieldedInSat} start={30} dur={36} />}
          unit="sat"
          foot={
            <>
              landed on a one-time address
              <br />
              <Mono style={{ fontSize: 24 }}>{short(as.shieldedFromAddress, 10, 6)}</Mono>
            </>
          }
        />
        <Arrow start={80} />
        <Node
          start={70}
          active={110}
          tone="blue"
          title="2. Zero-knowledge proof"
          value="Groth16"
          foot={
            <>
              built in the browser,
              <br />
              fee {fmt(as.feeSat)} sat
            </>
          }
        />
        <Arrow start={150} />
        <Node
          start={130}
          active={180}
          tone="green"
          title="3. Private"
          value={<CountUp to={as.privateNoteSat} start={180} dur={40} />}
          unit="sat"
          foot={
            <>
              inside the pool. No one can
              <br />
              follow where it goes next.
            </>
          }
        />
      </div>
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ label: string; children: React.ReactNode; start: number }> = ({ label, children, start }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "24px 28px", borderRadius: 22, background: "#f6f7fa", ...fadeUp(frame, start, 24, 24) }}>
      <span style={{ fontSize: 24, color: c.ink10, fontWeight: 550 }}>{label}</span>
      <span style={{ fontFamily: font.num, fontSize: 44, fontWeight: 650, color: c.ink12, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
        {children}
      </span>
    </div>
  );
};

const TxCard: React.FC = () => {
  const frame = useCurrentFrame();
  const p = usePop(24, 18);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 44 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: 1500 }}>
        <div style={fadeUp(frame, 0)}>
          <Kicker style={{ alignSelf: "center" }}>Auto-shield, BCH mainnet</Kicker>
        </div>
        <H1 size={70} style={{ textAlign: "center", ...fadeUp(frame, 6) }}>
          Zero-knowledge proof built in the browser, verified by BCH Script on mainnet.
        </H1>
      </div>
      <Card
        style={{
          width: 1500,
          padding: 36,
          display: "flex",
          flexDirection: "column",
          gap: 26,
          boxShadow: shadow.lift,
          opacity: p,
          translate: `0px ${interpolate(p, [0, 1], [60, 0])}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 24, color: c.ink10, fontWeight: 550 }}>Transaction</span>
            <Mono style={{ fontSize: 30, color: c.blue10 }}>{as.txid}</Mono>
          </div>
          <Badge tone="green">Confirmed</Badge>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <Stat label="Size" start={50}>
            <CountUp to={as.sizeBytes} start={50} dur={34} /> B
          </Stat>
          <Stat label="Fee" start={58}>
            {fmt(as.feeSat)} sat
          </Stat>
          <Stat label="Block" start={66}>
            {fmt(as.block)}
          </Stat>
          <Stat label="Pool value, sat" start={74}>
            {fmt(as.poolBefore)}
            <span style={{ color: c.ink9, margin: "0 10px" }}>→</span>
            <span style={{ color: c.green11 }}>
              <CountUp from={as.poolBefore} to={as.poolAfter} start={90} dur={50} />
            </span>
          </Stat>
        </div>
      </Card>
    </AbsoluteFill>
  );
};

export const Private: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: font.ui }}>
    <Backdrop />
    <Phase from={0} dur={135} name="Balance">
      <Balance />
    </Phase>
    <Phase from={131} dur={226} name="Visible to private">
      <Flow />
    </Phase>
    <Phase from={353} dur={187} name="Auto-shield tx" fadeOut={false}>
      <TxCard />
    </Phase>
  </AbsoluteFill>
);
