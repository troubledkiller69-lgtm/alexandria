import {
  AbsoluteFill,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import {
  BODY,
  DISPLAY,
  GOLD,
  HOOK,
  MATCHUPS,
  OUTRO,
  SCENE_LEN,
  TOTAL_FRAMES,
  type Matchup,
} from "./versus-data";

const springy = { stiffness: 220, damping: 22 };

const StaggerLines: React.FC<{
  lines: string[];
  fontSize: number;
  color?: string;
  delay?: number;
}> = ({ lines, fontSize, color = "#fff", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div>
      {lines.map((line, i) => {
        const p = spring({
          frame: frame - delay - i * 6,
          fps,
          config: springy,
        });
        const y = interpolate(p, [0, 1], [160, 0]);
        return (
          <div key={line} style={{ overflow: "hidden", paddingBottom: 12 }}>
            <div
              style={{
                transform: `translateY(${y}px)`,
                opacity: p,
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontStyle: "italic",
                fontSize,
                lineHeight: 1.02,
                letterSpacing: -2,
                color,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Kicker: React.FC<{ text: string; color?: string; delay?: number }> = ({
  text,
  color = GOLD,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity,
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 38,
        letterSpacing: 10,
        textTransform: "uppercase",
        color,
      }}
    >
      {text}
    </div>
  );
};

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const subOpacity = interpolate(frame, [34, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: 70 }}
    >
      <div style={{ position: "absolute", top: 420 }}>
        <Kicker text={HOOK.kicker} />
      </div>
      <div style={{ textAlign: "center" }}>
        <StaggerLines lines={HOOK.lines} fontSize={110} delay={6} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 380,
          opacity: subOpacity,
          fontFamily: BODY,
          fontSize: 42,
          color: "#cfcfd6",
          textAlign: "center",
          paddingLeft: 60,
          paddingRight: 60,
        }}
      >
        {HOOK.sub}
      </div>
    </AbsoluteFill>
  );
};

const MatchupScene: React.FC<{ matchup: Matchup }> = ({ matchup }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftIn = spring({ frame, fps, config: { stiffness: 140, damping: 18 } });
  const rightIn = spring({ frame: frame - 4, fps, config: { stiffness: 140, damping: 18 } });
  const vsPulse = 1 + 0.05 * Math.sin(frame / 5);
  const yearOpacity = interpolate(frame, [20, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subOpacity = interpolate(frame, [48, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 60,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStyle: "italic",
          fontSize: 48,
          color: matchup.left.accent,
          opacity: leftIn * yearOpacity,
        }}
      >
        {matchup.left.year}
      </div>
      <div
        style={{
          position: "absolute",
          top: 180,
          right: 60,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStyle: "italic",
          fontSize: 48,
          color: matchup.right.accent,
          opacity: rightIn * yearOpacity,
        }}
      >
        {matchup.right.year}
      </div>

      <div
        style={{
          position: "absolute",
          top: 300,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: 60,
          paddingRight: 60,
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 420,
            opacity: leftIn,
            transform: `translateX(${interpolate(leftIn, [0, 1], [-120, 0])}px)`,
          }}
        >
          <Img
            src={staticFile(matchup.left.poster)}
            style={{
              width: "100%",
              aspectRatio: "2/3",
              borderRadius: 20,
              boxShadow: `0 0 100px ${matchup.left.accent}55, 0 30px 50px rgba(0,0,0,0.7)`,
            }}
          />
        </div>

        <div
          style={{
            flex: "0 0 120",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              transform: `scale(${vsPulse})`,
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: 64,
              color: GOLD,
              textShadow: "0 0 40px #f5c518aa",
            }}
          >
            VS
          </div>
        </div>

        <div
          style={{
            flex: 1,
            maxWidth: 420,
            opacity: rightIn,
            transform: `translateX(${interpolate(rightIn, [0, 1], [120, 0])}px)`,
          }}
        >
          <Img
            src={staticFile(matchup.right.poster)}
            style={{
              width: "100%",
              aspectRatio: "2/3",
              borderRadius: 20,
              boxShadow: `0 0 100px ${matchup.right.accent}55, 0 30px 50px rgba(0,0,0,0.7)`,
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1180,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          paddingLeft: 90,
          paddingRight: 90,
        }}
      >
        <div style={{ opacity: leftIn * 0.9, textAlign: "left" }}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: 46,
              color: matchup.left.accent,
              letterSpacing: -1,
            }}
          >
            {matchup.left.title}
          </div>
        </div>
        <div style={{ opacity: rightIn * 0.9, textAlign: "right" }}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: 46,
              color: matchup.right.accent,
              letterSpacing: -1,
            }}
          >
            {matchup.right.title}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 360,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: subOpacity,
          fontFamily: BODY,
          fontSize: 40,
          color: "#cfcfd6",
        }}
      >
        Pick one. The other dies.
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + 0.03 * Math.sin(frame / 7);
  const subOpacity = interpolate(frame, [40, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: 70 }}
    >
      <div style={{ position: "absolute", top: 480 }}>
        <Kicker text={OUTRO.kicker} />
      </div>
      <div style={{ textAlign: "center" }}>
        <StaggerLines lines={OUTRO.lines} fontSize={120} delay={6} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 400,
          transform: `scale(${pulse})`,
          backgroundColor: GOLD,
          color: "#000",
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 42,
          padding: "26px 60px",
          borderRadius: 999,
          opacity: subOpacity,
        }}
      >
        {OUTRO.sub}
      </div>
    </AbsoluteFill>
  );
};

const GRAIN =
  "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"240\" height=\"240\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"2\"/></filter><rect width=\"240\" height=\"240\" filter=\"url(%23n)\" opacity=\"0.55\"/></svg>')";

export const VersusHorror: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080d" }}>
      <Sequence from={0} durationInFrames={SCENE_LEN}>
        <HookScene />
      </Sequence>
      {MATCHUPS.map((matchup, i) => (
        <Sequence
          key={matchup.id}
          from={(i + 1) * SCENE_LEN}
          durationInFrames={SCENE_LEN}
        >
          <MatchupScene matchup={matchup} />
        </Sequence>
      ))}
      <Sequence
        from={(MATCHUPS.length + 1) * SCENE_LEN}
        durationInFrames={SCENE_LEN}
      >
        <OutroScene />
      </Sequence>

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.78) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{ backgroundImage: GRAIN, opacity: 0.08, pointerEvents: "none" }}
      />

      <div
        style={{
          position: "absolute",
          top: 120,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 12,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        ALEXANDRIA
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 12,
          width: `${(frame / TOTAL_FRAMES) * 100}%`,
          background: `linear-gradient(90deg, ${GOLD}, #ff8a00)`,
        }}
      />
    </AbsoluteFill>
  );
};