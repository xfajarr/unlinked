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
  Ring,
  Shot,
  Sub,
  TwoUp,
  fadeUp,
  short,
  usePop,
} from "../ui";

const wc = data.wizardConnect;

const ShotIn: React.FC<{ start?: number; children: React.ReactNode }> = ({ start = 8, children }) => {
  const p = usePop(start, 18);
  return (
    <div
      style={{
        opacity: p,
        translate: `${interpolate(p, [0, 1], [120, 0])}px 0px`,
        scale: `${interpolate(p, [0, 1], [0.94, 1])}`,
      }}
    >
      {children}
    </div>
  );
};

const PayPage: React.FC = () => {
  const frame = useCurrentFrame();
  const H = 880;
  const W = Math.round((H * 916) / 1628);
  return (
    <TwoUp
      left={
        <>
          <div style={fadeUp(frame, 0)}>
            <Kicker>Pay with any wallet</Kicker>
          </div>
          <H1 style={fadeUp(frame, 6)}>Open the link. Tap Pay with wallet.</H1>
          <Sub style={fadeUp(frame, 14)}>
            WizardConnect pairs the payer's own BCH wallet with the pay page. No account needed.
          </Sub>
        </>
      }
      right={
        <ShotIn>
          <Shot src="pay.png" width={W} height={H} radius={34}>
            <Ring left={5.8} top={60.4} w={88.4} h={8.6} start={108} />
          </Shot>
        </ShotIn>
      }
    />
  );
};

const Connected: React.FC = () => {
  const frame = useCurrentFrame();
  const W = 960;
  const H = Math.round((W * 436) / 820);
  return (
    <TwoUp
      leftWidth={640}
      left={
        <>
          <div style={fadeUp(frame, 0)}>
            <Kicker>WizardConnect</Kicker>
          </div>
          <H1 style={fadeUp(frame, 6)}>Approve in your wallet.</H1>
          <Sub style={fadeUp(frame, 14)}>
            Cashonize, live session with Unlinked. The wallet signs, the page never sees your keys.
          </Sub>
        </>
      }
      right={
        <ShotIn>
          <div
            style={{
              padding: 26,
              borderRadius: 40,
              background: "#000",
              boxShadow: shadow.lift,
            }}
          >
            <Shot src="cashonize.png" width={W} height={H} radius={20} style={{ boxShadow: "none", background: "#000" }}>
              <Ring left={12.4} top={79.6} w={14} h={8.6} start={8} color="#2fd28f" />
            </Shot>
          </div>
        </ShotIn>
      }
    />
  );
};

const OutRow: React.FC<{
  start: number;
  idx: number;
  amount: React.ReactNode;
  label: React.ReactNode;
  detail: React.ReactNode;
  badge: React.ReactNode;
  accent?: boolean;
}> = ({ start, idx, amount, label, detail, badge, accent }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "22px 26px",
        borderRadius: 22,
        background: accent ? "#f5f8ff" : "#f7f8fa",
        boxShadow: accent ? `inset 0 0 0 2px ${c.blue6}` : "none",
        ...fadeUp(frame, start, 26, 30),
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: accent ? c.blue9 : c.wellStrong,
          color: accent ? "#fff" : c.ink11,
          display: "grid",
          placeItems: "center",
          fontFamily: font.num,
          fontWeight: 700,
          fontSize: 26,
          flexShrink: 0,
        }}
      >
        {idx}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontFamily: font.num, fontSize: 40, fontWeight: 650, color: c.ink12, letterSpacing: "-0.02em" }}>
            {amount}
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 26, fontWeight: 550, color: c.ink10 }}>{label}</span>
        </div>
        <div style={{ fontSize: 25, color: c.ink11 }}>{detail}</div>
      </div>
      {badge}
    </div>
  );
};

const Paid: React.FC = () => {
  const frame = useCurrentFrame();
  const H = 800;
  const W = Math.round((H * 458) / 751);
  const [o0, o1, o2] = wc.outputs;
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 70, padding: "0 110px" }}>
      <ShotIn start={4}>
        <Shot src="paid-wc.png" width={W} height={H} radius={29} />
      </ShotIn>
      <div style={{ width: 1000, display: "flex", flexDirection: "column", gap: 26 }}>
        <H1 size={58} style={{ ...fadeUp(frame, 20), lineHeight: 1.1 }}>
          Every payment lands on a fresh <span style={{ whiteSpace: "nowrap" }}>one-time</span> address only <span style={{ color: c.blue9 }}>@xfajarr</span> can find.
        </H1>
        <Card style={{ padding: 30, display: "flex", flexDirection: "column", gap: 16, ...fadeUp(frame, 40, 30, 40) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px 6px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 24, color: c.ink10, fontWeight: 550 }}>Transaction on BCH mainnet</span>
              <Mono style={{ fontSize: 32, color: c.blue10, fontWeight: 500 }}>{short(wc.txid, 10, 8)}</Mono>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Badge tone="grey">{wc.sizeBytes} bytes</Badge>
              <Badge tone="grey">{wc.seenWib} WIB</Badge>
            </div>
          </div>
          <OutRow
            start={60}
            idx={0}
            accent
            amount={<CountUp to={o0.sat} start={64} dur={36} />}
            label="sat to @xfajarr"
            detail={<Mono style={{ fontSize: 25 }}>{short(o0.address!, 12, 8)}</Mono>}
            badge={<Badge tone="green">one-time</Badge>}
          />
          <OutRow
            start={150}
            idx={1}
            amount="OP_RETURN"
            label="UNLK announcement"
            detail={
              <Mono style={{ fontSize: 23, whiteSpace: "nowrap" }}>
                <span style={{ color: c.blue10 }}>6a 04 554e4c4b</span> 01 00 21{" "}
                <span style={{ color: c.ink12 }}>{o1.ephemeralKey!.slice(0, 8)}…{o1.ephemeralKey!.slice(-4)}</span> 01 {o1.viewTag}
              </Mono>
            }
            badge={<Badge tone="blue">key + view tag</Badge>}
          />
          <OutRow
            start={220}
            idx={2}
            amount={<CountUp to={o2.sat} start={224} dur={36} />}
            label="sat change"
            detail={<Mono style={{ fontSize: 25 }}>{short(o2.address!, 12, 8)}</Mono>}
            badge={<Badge tone="grey">payer</Badge>}
          />
        </Card>
        <div style={{ fontSize: 26, color: c.ink10, ...fadeUp(frame, 210) }}>
          The announcement carries only an ephemeral key. Nothing on-chain names the receiver.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Wizard: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: font.ui }}>
    <Backdrop />
    <Phase from={0} dur={196} name="Pay page">
      <PayPage />
    </Phase>
    <Phase from={192} dur={96} name="Cashonize connected">
      <Connected />
    </Phase>
    <Phase from={284} dur={306} name="Paid + tx" fadeOut={false}>
      <Paid />
    </Phase>
  </AbsoluteFill>
);
