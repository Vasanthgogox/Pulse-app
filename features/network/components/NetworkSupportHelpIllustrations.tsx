/**
 * Metronic sketch-style help card illustrations (line art, reference-aligned).
 */
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

const INK = "#181C32";
const INK_SOFT = "#7E8299";
const STROKE = 1.4;

type Props = {
  width?: number;
  height?: number;
};

/** Thoughtful figure + floating question marks — Help Center card. */
export function NetworkHelpQuestionsIllustration({
  width = 128,
  height = 104,
}: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 128 104" fill="none">
      <SvgText
        x={94}
        y={22}
        fill={INK_SOFT}
        fontSize={13}
        fontWeight="600"
        opacity={0.85}
      >
        ?
      </SvgText>
      <SvgText
        x={16}
        y={28}
        fill={INK_SOFT}
        fontSize={11}
        fontWeight="600"
        opacity={0.7}
      >
        ?
      </SvgText>
      <SvgText
        x={104}
        y={36}
        fill={INK_SOFT}
        fontSize={9}
        fontWeight="600"
        opacity={0.55}
      >
        ?
      </SvgText>

      <Ellipse cx={54} cy={90} rx={24} ry={5} fill="#F1F3F8" />

      <Path
        d="M34 80c5-11 14-17 20-17s15 6 20 17"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M38 64c0-11 7-19 16-19s16 8 16 19v8H38v-8Z"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={54} cy={38} r={15.5} stroke={INK} strokeWidth={STROKE} />
      <Path
        d="M40 31c2.5-6.5 8.5-11 14-11s11.5 4.5 14 11"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M46 41.5c1.6 1 3.6 1.4 5.5.8M56 41.5c1.6 1 3.6 1.4 5.5.8"
        stroke={INK}
        strokeWidth={1.15}
        strokeLinecap="round"
      />
      <Path
        d="M49 49.5c2.4 1.8 5 2.2 7.5 1.2"
        stroke={INK}
        strokeWidth={1.15}
        strokeLinecap="round"
      />

      <Path
        d="M66 54c3.5 6.5 1.5 13-3 15.5"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M68 60c3.2 1.2 6.5.4 9-1.5"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Circle cx={69} cy={57} r={2.2} fill={INK} />

      <G opacity={0.95}>
        <Path
          d="M88 36h7.5c2.8 0 5 2.2 5 5v9.5c0 2.8-2.2 5-5 5H88"
          stroke={INK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <Path
          d="M88 45.5h-3.8c-1.8 0-3.2 1.4-3.2 3.3v4.8c0 1.9 1.4 3.3 3.2 3.3H88"
          stroke={INK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <Path
          d="M78 32h5.5v3.8h-5.5c-1.4 0-2.4 1.1-2.4 2.4s1 2.4 2.4 2.4H81"
          stroke={INK}
          strokeWidth={1.05}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

/** Headset agent + support bubbles — Contact Support card. */
export function NetworkHelpSupportIllustration({
  width = 128,
  height = 104,
}: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 128 104" fill="none">
      <G>
        <Rect
          x={76}
          y={8}
          width={40}
          height={30}
          rx={11}
          stroke={INK}
          strokeWidth={STROKE}
          fill="#FAFBFC"
        />
        <Path
          d="M88.5 18.5c1.4-2.2 3.8-3.5 6.2-3.5 2.8 0 5 2.2 5 5s-2.2 5-5 5"
          stroke={INK}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <Path
          d="M90 27.5h12"
          stroke={INK}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <Path
          d="M96 22v3.5M98.5 24.5H93.5"
          stroke={INK}
          strokeWidth={1}
          strokeLinecap="round"
        />

        <Rect
          x={70}
          y={56}
          width={46}
          height={32}
          rx={11}
          stroke={INK}
          strokeWidth={STROKE}
          fill="#FAFBFC"
        />
        <Path
          d="M82 74l4 4 7-8"
          stroke={INK}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M98 70v9M94.5 73.5h7"
          stroke={INK}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </G>

      <Ellipse cx={44} cy={92} rx={25} ry={5} fill="#F1F3F8" />
      <Path
        d="M24 82c5-11 14-17 20-17s15 6 20 17"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M28 66c0-11 7-19 16-19s16 8 16 19v8H28v-8Z"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={44} cy={40} r={15.5} stroke={INK} strokeWidth={STROKE} />
      <Path
        d="M30 33c2.5-6.5 8.5-11 14-11s11.5 4.5 14 11"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M36 43c1.4.8 3 .8 4.5 0M47 43c1.4.8 3 .8 4.5 0"
        stroke={INK}
        strokeWidth={1.1}
        strokeLinecap="round"
      />
      <Path
        d="M40 51c2.5 2 5.5 2 8 0"
        stroke={INK}
        strokeWidth={1.1}
        strokeLinecap="round"
      />

      <Path
        d="M22 42c-4.5 2.2-8 6.5-9 12"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M66 42c4.5 2.2 8 6.5 9 12"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M18 46h-5.5c-2.2 0-3.8 1.7-3.8 3.8v5c0 2.1 1.6 3.8 3.8 3.8H18"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M70 46h5.5c2.2 0 3.8 1.7 3.8 3.8v5c0 2.1-1.6 3.8-3.8 3.8H70"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M44 55v4.5"
        stroke={INK}
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  );
}
