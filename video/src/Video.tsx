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

// ElevenLabs narration (voice "Brian"), start frame per clip; scene and phase cuts sit on its sentence breaks
const VO: [string, number][] = [["1-hook", 12], ["2-onelink", 232], ["3-wizard", 492], ["4-private", 1062], ["5-chain", 1537], ["6-hood", 1942], ["7-end", 2367]];

export const SCENES = [
  { name: "Hook", dur: 300, C: Hook },
  { name: "One link", dur: 220, C: OneLink },
  { name: "WizardConnect", dur: 590, C: Wizard },
  { name: "Private by default", dur: 495, C: Private },
  { name: "Any chain", dur: 425, C: CrossChain },
  { name: "Under the hood", dur: 445, C: UnderHood },
  { name: "End", dur: 210, C: End },
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
      <Sequence key={f} from={sec} layout="none">
        <Audio src={staticFile(`vo/${f}.mp3`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
