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
// [file, start frame, trim start frame, trim end frame]. Two clips are split on a pause: the balance legend gets time
// before the proof line, and the node flow builds between "Under the hood," and the pool's parts.
const VO: [string, number, number?, number?][] = [
  ["1-hook", 12],
  ["2-onelink", 232],
  ["3-wizard", 572],
  ["4-private", 1142, 0, 66],
  ["4-private", 1265, 66],
  ["5-chain", 1662],
  ["6-hood", 2067, 0, 30],
  ["6-hood", 2205, 30],
  ["7-end", 2617],
];

export const SCENES = [
  { name: "Hook", dur: 300, C: Hook },
  { name: "One link", dur: 300, C: OneLink },
  { name: "WizardConnect", dur: 590, C: Wizard },
  { name: "Private by default", dur: 540, C: Private },
  { name: "Any chain", dur: 425, C: CrossChain },
  { name: "Under the hood", dur: 570, C: UnderHood },
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
    {VO.map(([f, from, trimBefore, trimAfter]) => (
      <Sequence key={`${f}-${from}`} from={from} layout="none">
        <Audio src={staticFile(`vo/${f}.mp3`)} trimBefore={trimBefore} trimAfter={trimAfter} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
