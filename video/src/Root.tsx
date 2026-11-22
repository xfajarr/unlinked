import React from "react";
import { Composition } from "remotion";
import { TOTAL, UnlinkedDemo } from "./Video";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="UnlinkedDemo"
    component={UnlinkedDemo}
    durationInFrames={TOTAL}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
