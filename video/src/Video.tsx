import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Hook } from "./scenes/Hook";
import { OneLink } from "./scenes/OneLink";
import { Wizard } from "./scenes/Wizard";
import { Private } from "./scenes/Private";
import { CrossChain } from "./scenes/CrossChain";
import { UnderHood } from "./scenes/UnderHood";
import { End } from "./scenes/End";
import { c, font } from "./theme";

const T = 20;

// ElevenLabs narration (voice "Brian"), one clip per scene, start in seconds
const VO: [string, number][] = [["1-hook", 0.8], ["2-onelink", 12], ["3-wizard", 27.5], ["4-private", 61], ["5-chain", 90.2], ["6-hood", 113.5], ["7-end", 137]];

export const SCENES = [
  { name: "Hook", dur: 360, C: Hook },
  { name: "One link", dur: 480, C: OneLink },
  { name: "WizardConnect", dur: 1020, C: Wizard },
  { name: "Private by default", dur: 900, C: Private },
  { name: "Any chain", dur: 720, C: CrossChain },
  { name: "Under the hood", dur: 720, C: UnderHood },
  { name: "End", dur: 300, C: End },
];

export const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0) - (SCENES.length - 1) * T;

const fadeT = linearTiming({ durationInFrames: T });
const springT = springTiming({ config: { damping: 200 }, durationInFrames: T });

export const UnlinkedDemo: React.FC = () => (
  <AbsoluteFill style={{ background: c.ground, fontFamily: font.ui, color: c.ink12 }}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const seq = (
          <TransitionSeries.Sequence key={s.name} name={s.name} durationInFrames={s.dur}>
            <s.C />
          </TransitionSeries.Sequence>
        );
        if (i === 0) return [seq];
        const useSlide = i === 2 || i === 4;
        return [
          <TransitionSeries.Transition
            key={`${s.name}-t`}
            presentation={useSlide ? slide({ direction: "from-right" }) : fade()}
            timing={useSlide ? springT : fadeT}
          />,
          seq,
        ];
      })}
    </TransitionSeries>
    {VO.map(([f, sec]) => (
      <Sequence key={f} from={Math.round(sec * 30)} layout="none">
        <Audio src={staticFile(`vo/${f}.mp3`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
