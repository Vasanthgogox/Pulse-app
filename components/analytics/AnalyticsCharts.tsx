/**
 * Shared animated chart primitives for party analytics dashboards.
 * Built on react-native-svg + Animated (same stack as vehicle analytics).
 */
import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { Theme } from "@/constants/Theme";
import { formatINRChip } from "@/lib/format";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const PAD = { top: 20, right: 14, bottom: 32, left: 50 };

export interface TrendPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  tripCount: number;
}

function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const dx = (p1.x - p0.x) * 0.4;
    d += ` C ${(p0.x + dx).toFixed(2)} ${p0.y.toFixed(2)}, ${(p1.x - dx).toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

function smoothAreaPath(
  pts: { x: number; y: number }[],
  baseY: number,
  leftX: number,
): string {
  const line = smoothLinePath(pts);
  if (!line || pts.length < 2) return "";
  const last = pts[pts.length - 1];
  return `${line} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${leftX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

function useEntranceAnim(trigger: string, duration = 520) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [trigger, anim, duration]);
  return anim;
}

function useBarAnim(trigger: string, duration = 780) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [trigger, anim, duration]);
  return anim;
}

export interface TrendLineChartProps {
  data: readonly TrendPoint[];
  width: number;
  height?: number;
  field: "revenue" | "profit" | "margin";
  color?: string;
  gradientId?: string;
}

export const TrendLineChart = memo(function TrendLineChart({
  data,
  width,
  height = 160,
  field,
  color = Theme.primary,
  gradientId = "trendLineGrad",
}: TrendLineChartProps) {
  const trigger = data.map((d) => `${d.label}:${d[field]}`).join("|") + field;
  const entrance = useEntranceAnim(trigger);
  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const values = data.map((d) => d[field]);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const n = data.length;
  const scaleX = (i: number) =>
    PAD.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const scaleY = (v: number) => PAD.top + ((maxVal - v) / range) * chartH;

  const pts = data.map((d, i) => ({ x: scaleX(i), y: scaleY(d[field]) }));
  const baseY = PAD.top + chartH;

  const linePath = smoothLinePath(pts);
  const areaPath = smoothAreaPath(pts, baseY, PAD.left);

  const yTicks = [0, 0.5, 1].map((t) => ({
    y: PAD.top + t * chartH,
    val: maxVal - t * range,
  }));

  const isMargin = field === "margin";
  const pathLength = useMemo(() => {
    if (pts.length < 2) return 400;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.max(len * 1.2, 200);
  }, [pts]);

  const lineDraw = useRef(new Animated.Value(pathLength)).current;
  useEffect(() => {
    lineDraw.setValue(pathLength);
    Animated.timing(lineDraw, {
      toValue: 0,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [lineDraw, pathLength, trigger]);

  return (
    <Animated.View style={{ opacity: entrance, transform: [{ translateY }] }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick, i) => (
          <Line
            key={i}
            x1={PAD.left}
            y1={tick.y}
            x2={PAD.left + chartW}
            y2={tick.y}
            stroke={Theme.borderLight}
            strokeWidth={1}
            strokeDasharray={i === 2 ? undefined : "3 3"}
          />
        ))}

        {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}

        {linePath ? (
          <AnimatedPath
            d={linePath}
            stroke={color}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pathLength}
            strokeDashoffset={lineDraw}
          />
        ) : null}

        {pts.map((p, i) => (
          <TrendDot
            key={`${p.x}-${p.y}-${i}`}
            cx={p.x}
            cy={p.y}
            color={color}
            index={i}
            trigger={trigger}
          />
        ))}

        {yTicks.map((tick, i) => (
          <SvgText
            key={i}
            x={PAD.left - 5}
            y={tick.y + 4}
            textAnchor="end"
            fontSize={8}
            fill={Theme.textMuted}
          >
            {isMargin
              ? `${tick.val.toFixed(0)}%`
              : formatINRChip(Math.abs(tick.val))}
          </SvgText>
        ))}

        {data.map((d, i) => (
          <SvgText
            key={d.label}
            x={scaleX(i)}
            y={height - 6}
            textAnchor="middle"
            fontSize={9}
            fill={Theme.textMuted}
            fontWeight="600"
          >
            {d.label}
          </SvgText>
        ))}
      </Svg>
    </Animated.View>
  );
});

function TrendDot({
  cx,
  cy,
  color,
  index,
  trigger,
}: {
  cx: number;
  cy: number;
  color: string;
  index: number;
  trigger: string;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    scale.setValue(0);
    const t = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: false,
      }).start();
    }, 120 + index * 55);
    return () => clearTimeout(t);
  }, [scale, index, trigger]);

  const r = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 5],
  });

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r as unknown as number}
      fill={Theme.screenBackground}
      stroke={color}
      strokeWidth={2}
    />
  );
}

export interface TrendBarChartProps {
  data: readonly TrendPoint[];
  width: number;
  height?: number;
  /** Primary bar field (defaults to revenue). */
  primaryField?: "revenue" | "expense";
  /** Secondary bar field (defaults to expense). */
  secondaryField?: "revenue" | "expense";
  primaryColor?: string;
  secondaryColor?: string;
}

export const TrendBarChart = memo(function TrendBarChart({
  data,
  width,
  height = 168,
  primaryField = "revenue",
  secondaryField = "expense",
  primaryColor = Theme.primary,
  secondaryColor = Theme.teslaRed,
}: TrendBarChartProps) {
  const trigger = data.map((d) => d.label).join(",");
  const barAnim = useBarAnim(trigger);
  const entrance = useEntranceAnim(trigger, 400);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const maxVal = Math.max(
    ...data.flatMap((d) => [d[primaryField], d[secondaryField]]),
    1,
  );
  const baseY = PAD.top + chartH;
  const barGroupW = data.length > 0 ? chartW / data.length : chartW;
  const barW = Math.max(4, Math.min(20, barGroupW * 0.34));

  const scaleH = (v: number) => Math.max(2, (v / maxVal) * chartH);
  const scaleX = (i: number) => PAD.left + i * barGroupW + barGroupW / 2;

  return (
    <Animated.View style={{ opacity: entrance }}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t, i) => (
          <Line
            key={i}
            x1={PAD.left}
            y1={PAD.top + t * chartH}
            x2={PAD.left + chartW}
            y2={PAD.top + t * chartH}
            stroke={Theme.borderLight}
            strokeWidth={1}
            strokeDasharray={i > 0 ? "3 3" : undefined}
          />
        ))}

        <SvgText
          x={PAD.left - 5}
          y={PAD.top + 4}
          textAnchor="end"
          fontSize={8}
          fill={Theme.textMuted}
        >
          {formatINRChip(maxVal)}
        </SvgText>

        {data.map((d, i) => {
          const gx = scaleX(i);
          const primaryH = scaleH(d[primaryField]);
          const secondaryH = scaleH(d[secondaryField]);

          const animPrimaryH = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, primaryH],
          });
          const animPrimaryY = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [baseY, baseY - primaryH],
          });
          const animSecondaryH = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, secondaryH],
          });
          const animSecondaryY = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [baseY, baseY - secondaryH],
          });

          return (
            <G key={d.label}>
              <AnimatedRect
                x={gx - barW - 1.5}
                y={animPrimaryY as unknown as number}
                width={barW}
                height={animPrimaryH as unknown as number}
                fill={primaryColor}
                rx={3}
                fillOpacity={0.92}
              />
              <AnimatedRect
                x={gx + 1.5}
                y={animSecondaryY as unknown as number}
                width={barW}
                height={animSecondaryH as unknown as number}
                fill={secondaryColor}
                rx={3}
                fillOpacity={0.78}
              />
              <SvgText
                x={gx}
                y={height - 7}
                textAnchor="middle"
                fontSize={9}
                fill={Theme.textMuted}
                fontWeight="600"
              >
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </Animated.View>
  );
});

/** @deprecated Use TrendLineChart — alias for migration from vehicle charts. */
export const LineChart = TrendLineChart;

/** @deprecated Use TrendBarChart — alias for migration from vehicle charts. */
export const RevExpBarChart = TrendBarChart;
