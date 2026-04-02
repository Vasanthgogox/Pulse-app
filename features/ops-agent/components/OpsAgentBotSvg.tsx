/**
 * Ops Agent bot avatar — 3D-style AI assistant SVG matching the reference design.
 * Tesla red accents, white casing, dark screen face, waving arm, typing dots.
 * No SVG filters (blur/shadow) so it renders in Expo Go; uses only shapes and gradients.
 */
import React from "react";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 480;

export interface OpsAgentBotSvgProps {
  width?: number;
  height?: number;
  /** When true, only the head is shown (for small avatars). */
  headOnly?: boolean;
  /** When true, use brighter colors for visibility on dark backgrounds (e.g. tab bar). */
  bright?: boolean;
}

export function OpsAgentBotSvg({
  width = 100,
  height = (VIEWBOX_HEIGHT / VIEWBOX_WIDTH) * width,
  headOnly = false,
  bright = false,
}: OpsAgentBotSvgProps) {
  const w = bright
    ? { mid: "#eef2f8", end: "#d0dce8" }
    : { mid: "#e6edf5", end: "#b8cce0" };
  const r = bright
    ? { start: "#ff8585", mid: "#ff4454", end: "#c91c1c" }
    : { start: "#ff6b6b", mid: "#e82127", end: "#991216" };
  const s = bright
    ? { start: "#2c3544", end: "#181c28" }
    : { start: "#1a2436", end: "#080c14" };
  const m = bright
    ? { mid: "#c8d4e0", end: "#98aab8" }
    : { mid: "#b6c5d6", end: "#8095ad" };

  return (
    <Svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
    >
        <Defs>
          <LinearGradient id="whiteMat" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#ffffff" />
            <Stop offset="60%" stopColor={w.mid} />
            <Stop offset="100%" stopColor={w.end} />
          </LinearGradient>
          <LinearGradient id="redMat" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={r.start} />
            <Stop offset="50%" stopColor={r.mid} />
            <Stop offset="100%" stopColor={r.end} />
          </LinearGradient>
          <LinearGradient id="screenMat" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={s.start} />
            <Stop offset="100%" stopColor={s.end} />
          </LinearGradient>
          <LinearGradient id="metalMat" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#ffffff" />
            <Stop offset="50%" stopColor={m.mid} />
            <Stop offset="100%" stopColor={m.end} />
          </LinearGradient>
        </Defs>

        {!headOnly && (
          <>
            <G>
              <Circle cx={260} cy={240} r={12} fill="url(#metalMat)" />
              <Circle cx={270} cy={255} r={11} fill="url(#metalMat)" />
              <Circle cx={280} cy={270} r={11} fill="url(#metalMat)" />
              <Circle cx={288} cy={285} r={11} fill="url(#metalMat)" />
              <Rect x={275} y={300} width={36} height={24} rx={10} fill="url(#redMat)" transform="rotate(-15 293 312)" />
              <Path d="M 283 340 A 20 20 0 1 0 315 320" fill="none" stroke="url(#metalMat)" strokeWidth={14} strokeLinecap="round" />
            </G>
            <G>
              <Circle cx={150} cy={240} r={12} fill="url(#metalMat)" />
              <Circle cx={132} cy={228} r={11} fill="url(#metalMat)" />
              <Circle cx={116} cy={214} r={11} fill="url(#metalMat)" />
              <Circle cx={106} cy={196} r={11} fill="url(#metalMat)" />
              <Circle cx={102} cy={176} r={11} fill="url(#metalMat)" />
              <Rect x={84} y={146} width={36} height={24} rx={10} fill="url(#redMat)" transform="rotate(15 102 158)" />
              <Path d="M 83 135 A 20 20 0 1 1 115 125" fill="none" stroke="url(#metalMat)" strokeWidth={14} strokeLinecap="round" />
            </G>
            <G>
              <Rect x={180} y={195} width={40} height={35} rx={12} fill="url(#metalMat)" />
              <Rect x={140} y={215} width={120} height={110} rx={45} fill="url(#whiteMat)" />
              <Path d="M 155 225 Q 200 220 245 225 A 35 35 0 0 1 250 240 Q 200 235 150 240 A 35 35 0 0 1 155 225 Z" fill="#ffffff" opacity={0.6} />
            </G>
          </>
        )}

        <G>
          <Rect x={95} y={115} width={30} height={60} rx={15} fill="url(#redMat)" />
          <Rect x={275} y={115} width={30} height={60} rx={15} fill="url(#redMat)" />
          <Rect x={195} y={45} width={10} height={40} rx={5} fill="url(#whiteMat)" />
          <Circle cx={200} cy={35} r={14} fill="url(#redMat)" />
          <Circle cx={196} cy={31} r={4} fill="#ffffff" opacity={0.6} />
          <Rect x={105} y={80} width={190} height={130} rx={50} fill="url(#whiteMat)" />
          <Rect x={125} y={86} width={150} height={14} rx={7} fill="#ffffff" opacity={0.7} />
          <Rect x={120} y={95} width={160} height={96} rx={35} fill="url(#screenMat)" />
          <Rect x={135} y={100} width={130} height={10} rx={5} fill="#ffffff" opacity={bright ? 0.2 : 0.12} />
          {/* Single circle per eye (fill + stroke) to avoid layered overlap */}
          <Circle cx={165} cy={135} r={10} fill="#ffffff" stroke={bright ? "#ff5555" : "#ff6b6b"} strokeWidth={2} />
          <Circle cx={235} cy={135} r={10} fill="#ffffff" stroke={bright ? "#ff5555" : "#ff6b6b"} strokeWidth={2} />
          {/* Single mouth path - white only for clean edge; red accent via stroke on same path would double-draw, so use one clear stroke */}
          <Path d="M 160 155 Q 200 185 240 155" stroke="#ffffff" strokeWidth={bright ? 7 : 6} strokeLinecap="round" fill="none" />
        </G>

        {!headOnly && (
          <G>
            <Rect x={150} y={415} width={100} height={30} rx={15} fill="#ffffff" opacity={0.9} />
            <Circle cx={170} cy={430} r={6} fill="#e82127" />
            <Circle cx={200} cy={430} r={6} fill="#e82127" />
            <Circle cx={230} cy={430} r={6} fill="#e82127" />
          </G>
        )}
      </Svg>
  );
}
