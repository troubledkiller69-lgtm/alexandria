import { Composition } from "remotion";
import { Trending5 } from "./Trending5";
import { VersusHorror } from "./VersusHorror";
import { H, TOTAL_FRAMES, FPS, W } from "./trending-data";
import { H as VH, TOTAL_FRAMES as VF, FPS as VFP, W as VW } from "./versus-data";

export const RemotionComposition = () => {
  return (
    <>
      <Composition
        id="Trending5"
        component={Trending5}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="VersusHorror"
        component={VersusHorror}
        durationInFrames={VF}
        fps={VFP}
        width={VW}
        height={VH}
      />
    </>
  );
};