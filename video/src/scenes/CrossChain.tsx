import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import data from "../data.json";
import { c, font } from "../theme";
import {
  Backdrop,
  Badge,
  Card,
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

const x = data.crossChain;

const STEPS = [
  {
    time: `${x.bnbBlockTimeWib} WIB`,
    title: "0.5 USDT sent",
    where: `BNB Chain, block ${fmt(x.bnbBlock)}`,
    hash: short(x.bnbDepositTx, 10, 6),
    tone: "amber" as const,
  },
  {
    time: `${x.nearSettleWib} WIB`,
    title: "Swapped on NEAR Intents",
    where: `${x.nearSettleElapsed} later`,
    hash: short(x.nearSettleTx, 8, 6),
    tone: "blue" as const,
  },
  {
    time: `${x.bchBlockTimeWib} WIB`,
    title: "0.00255511 BCH landed",
    where: `one-time address ${short(x.bchPayoutAddress, 8, 4)}`,
    hash: short(x.bchPayoutTx, 10, 6),
    tone: "green" as const,
  },
];

const Timeline: React.FC = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [50, 250], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const coin = usePop(16, 14);
  return (
    <AbsoluteFill style={{ padding: "110px 130px", flexDirection: "column", gap: 70 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 1300 }}>
          <div style={fadeUp(frame, 0)}>
            <Kicker>Pay from any chain</Kicker>
          </div>
          <H1 style={fadeUp(frame, 6)}>
            0.5 USDT on BNB Chain became BCH for <span style={{ color: c.blue9 }}>{x.recipientHandle}</span>.
          </H1>
          <Sub style={fadeUp(frame, 14)}>NEAR Intents does the swap. The BCH still lands on a <span style={{ whiteSpace: "nowrap" }}>one-time</span> address.</Sub>
        </div>
        <Img
          src={staticFile("coin-usdt.webp")}
          style={{
            width: 230,
            height: 230,
            objectFit: "contain",
            opacity: coin,
            scale: `${coin}`,
            rotate: `${interpolate(frame, [0, 470], [-12, 8])}deg`,
            translate: `0px ${Math.sin(frame / 22) * 10}px`,
          }}
        />
      </div>

      <div style={{ position: "relative", display: "flex", gap: 40 }}>
        <div style={{ position: "absolute", left: 30, right: 30, top: 28, height: 6, borderRadius: 6, background: c.wellStrong }} />
        <div
          style={{
            position: "absolute",
            left: 30,
            top: 28,
            height: 6,
            borderRadius: 6,
            width: `calc((100% - 60px) * ${line})`,
            background: c.blue9,
          }}
        />
        {STEPS.map((s, i) => {
          const start = 50 + i * 90;
          const dot = interpolate(frame, [start, start + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={s.title} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30, alignSelf: "stretch" }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 99,
                  background: dot > 0.5 ? c.blue9 : "#fff",
                  border: `6px solid ${dot > 0.5 ? c.blue9 : c.wellStrong}`,
                  boxShadow: dot > 0.5 ? "0 0 0 12px rgba(37,99,255,0.15)" : "none",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontFamily: font.num,
                  fontWeight: 700,
                  fontSize: 26,
                  scale: `${0.8 + dot * 0.2}`,
                }}
              >
                {i + 1}
              </div>
              <Card style={{ flex: 1, padding: "30px 32px", display: "flex", flexDirection: "column", gap: 12, ...fadeUp(frame, start, 26, 36) }}>
                <Badge tone={s.tone} style={{ alignSelf: "flex-start", fontFamily: font.num }}>
                  {s.time}
                </Badge>
                <div style={{ fontSize: 40, fontWeight: 650, letterSpacing: "-0.025em", color: c.ink12 }}>{s.title}</div>
                <div style={{ fontSize: 27, color: c.ink11 }}>{s.where}</div>
                <Mono style={{ fontSize: 26, color: c.blue10 }}>{s.hash}</Mono>
              </Card>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SecondPayment: React.FC = () => {
  const frame = useCurrentFrame();
  const p = usePop(8, 18);
  const H = 820;
  const W = Math.round((H * 459) / 635);
  return (
    <TwoUp
      leftWidth={680}
      left={
        <>
          <div style={fadeUp(frame, 0)}>
            <Kicker>Same ending, every chain</Kicker>
          </div>
          <H1 style={fadeUp(frame, 6)}>Cross-chain money arrives like any other payment.</H1>
          <Sub style={fadeUp(frame, 14)}>
            This one paid @xfajarr <b style={{ color: c.ink12 }}>0.00254593 BCH</b> through NEAR Intents. The auto-shield you just saw moved this exact payment into the pool.
          </Sub>
        </>
      }
      right={
        <div style={{ opacity: p, translate: `${interpolate(p, [0, 1], [120, 0])}px 0px` }}>
          <Shot src="paid-xchain.png" width={W} height={H} radius={35} />
        </div>
      }
    />
  );
};

export const CrossChain: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: font.ui }}>
    <Backdrop />
    <Phase from={0} dur={470} name="Timeline">
      <Timeline />
    </Phase>
    <Phase from={466} dur={254} name="Second payment" fadeOut={false}>
      <SecondPayment />
    </Phase>
  </AbsoluteFill>
);
