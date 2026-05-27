import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Tiranga chip beside +91 (party entry wizards). */
export function IndiaFlagIcon({
  width = 20,
  height = 15,
}: {
  width?: number;
  height?: number;
}) {
  const spokes = [...Array(24)].map((_, i) => (
    <Path
      key={i}
      transform={`rotate(${i * 15} 450 300)`}
      d="M450 208L444 300L456 300Z"
      fill="#000080"
    />
  ));
  return (
    <Svg width={width} height={height} viewBox="0 0 900 600">
      <Rect width={900} height={600} fill="#FF9933" />
      <Rect width={900} height={400} y={200} fill="#FFFFFF" />
      <Rect width={900} height={200} y={400} fill="#138808" />
      <Circle cx={450} cy={300} r={92.5} fill="#000080" />
      <Circle cx={450} cy={300} r={80} fill="#FFFFFF" />
      <Circle cx={450} cy={300} r={16} fill="#000080" />
      {spokes}
    </Svg>
  );
}
