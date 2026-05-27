/**
 * SVG chart primitives for Vehicle Asset Analytics.
 * Built on react-native-svg (already a project dependency — no new packages).
 */
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
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
import Theme from "@/constants/Theme";
import { formatINRChip } from "@/lib/format";
import type { ExpenseCat, PeriodPoint } from "./analyticsUtils";

// ─── Animated SVG primitives ──────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── Shared chart padding ─────────────────────────────────────────────────────

const PAD = { top: 20, right: 14, bottom: 32, left: 50 };

// ─── Smooth bezier helpers ────────────────────────────────────────────────────

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
  leftX: number
): string {
  const line = smoothLinePath(pts);
  if (!line || pts.length < 2) return "";
  const last = pts[pts.length - 1];
  return `${line} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${leftX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

// ─── Local animation hooks ────────────────────────────────────────────────────

function useEntranceAnim(trigger: string, duration = 500) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [trigger]);
  return anim;
}

function useBarAnim(trigger: string, duration = 700) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [trigger]);
  return anim;
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

interface LineChartProps {
  data: PeriodPoint[];
  width: number;
  height?: number;
  field: "revenue" | "profit" | "margin";
  color?: string;
  gradientId?: string;
}

export function LineChart({
  data,
  width,
  height = 140,
  field,
  color = Theme.primary,
  gradientId = "lineGrad",
}: LineChartProps) {
  const trigger = data.map((d) => d.label).join(",") + field;
  const entrance = useEntranceAnim(trigger);
  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const values = data.map((d) => d[field]);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(Math.min(...values, 0), 0);
  const range = maxVal - minVal || 1;

  const n = data.length;
  const scaleX = (i: number) =>
    PAD.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const scaleY = (v: number) => PAD.top + ((maxVal - v) / range) * chartH;

  const pts = data.map((d, i) => ({ x: scaleX(i), y: scaleY(d[field]) }));
  const baseY = PAD.top + chartH;

  const linePath = smoothLinePath(pts);
  const areaPath = smoothAreaPath(pts, baseY, PAD.left);

  // Y-axis ticks: 0, mid, max
  const yTicks = [0, 0.5, 1].map((t) => ({
    y: PAD.top + t * chartH,
    val: maxVal - t * range,
  }));

  const isMargin = field === "margin";

  return (
    <Animated.View style={{ opacity: entrance, transform: [{ translateY }] }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.20" />
            <Stop offset="1" stopColor={color} stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
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

        {/* Area fill */}
        {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}

        {/* Line stroke */}
        {linePath ? (
          <Path
            d={linePath}
            stroke={color}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Data points */}
        {pts.map((p, i) => (
          <G key={i}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={4.5}
              fill={Theme.screenBackground}
              stroke={color}
              strokeWidth={2}
            />
          </G>
        ))}

        {/* Y axis labels */}
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

        {/* X axis labels */}
        {data.map((d, i) => (
          <SvgText
            key={i}
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
}

// ─── Revenue vs Expense Bar Chart ─────────────────────────────────────────────

interface RevExpBarChartProps {
  data: PeriodPoint[];
  width: number;
  height?: number;
}

export function RevExpBarChart({ data, width, height = 160 }: RevExpBarChartProps) {
  const trigger = data.map((d) => d.label).join(",");
  const barAnim = useBarAnim(trigger);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.expense]), 1);
  const baseY = PAD.top + chartH;
  const barGroupW = data.length > 0 ? chartW / data.length : chartW;
  const barW = Math.max(3, Math.min(18, barGroupW * 0.32));

  const scaleH = (v: number) => Math.max(2, (v / maxVal) * chartH);
  const scaleX = (i: number) => PAD.left + i * barGroupW + barGroupW / 2;

  return (
    <Svg width={width} height={height}>
      {/* Grid */}
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

      {/* Y label */}
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
        const revH = scaleH(d.revenue);
        const expH = scaleH(d.expense);

        const animRevH = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, revH],
        });
        const animRevY = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [baseY, baseY - revH],
        });
        const animExpH = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, expH],
        });
        const animExpY = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [baseY, baseY - expH],
        });

        return (
          <G key={i}>
            {/* Revenue bar (indigo) */}
            <AnimatedRect
              x={gx - barW - 1.5}
              y={animRevY as any}
              width={barW}
              height={animRevH as any}
              fill={Theme.primary}
              rx={2}
              fillOpacity={0.9}
            />
            {/* Expense bar (red) */}
            <AnimatedRect
              x={gx + 1.5}
              y={animExpY as any}
              width={barW}
              height={animExpH as any}
              fill={Theme.teslaRed}
              rx={2}
              fillOpacity={0.75}
            />
            {/* X label */}
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
  );
}

// ─── Profit per Trip Bar Chart ────────────────────────────────────────────────

export function ProfitBarChart({ data, width, height = 130 }: RevExpBarChartProps) {
  const trigger = data.map((d) => d.label).join(",");
  const barAnim = useBarAnim(trigger);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const profits = data.map((d) => d.profit);
  const maxVal = Math.max(...profits.map(Math.abs), 1);
  const baseY = PAD.top + chartH / 2; // center line for positive/negative
  const barGroupW = data.length > 0 ? chartW / data.length : chartW;
  const barW = Math.max(3, Math.min(20, barGroupW * 0.55));
  const scaleX = (i: number) => PAD.left + i * barGroupW + barGroupW / 2;
  const scaleH = (v: number) => Math.max(2, (Math.abs(v) / maxVal) * (chartH / 2));

  return (
    <Svg width={width} height={height}>
      {/* Zero line */}
      <Line
        x1={PAD.left}
        y1={baseY}
        x2={PAD.left + chartW}
        y2={baseY}
        stroke={Theme.borderMedium}
        strokeWidth={1.5}
      />
      {/* Grid top/bottom */}
      {[-1, 1].map((dir, i) => (
        <Line
          key={i}
          x1={PAD.left}
          y1={baseY - dir * (chartH / 2)}
          x2={PAD.left + chartW}
          y2={baseY - dir * (chartH / 2)}
          stroke={Theme.borderLight}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {data.map((d, i) => {
        const gx = scaleX(i);
        const h = scaleH(d.profit);
        const positive = d.profit >= 0;

        const animH = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, h],
        });
        const animY = positive
          ? barAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [baseY, baseY - h],
            })
          : (baseY as unknown as Animated.AnimatedInterpolation<number>);

        return (
          <G key={i}>
            <AnimatedRect
              x={gx - barW / 2}
              y={positive ? (animY as any) : baseY}
              width={barW}
              height={animH as any}
              fill={positive ? Theme.darkGreen : Theme.teslaRed}
              rx={2}
              fillOpacity={0.85}
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

      {/* Y label max */}
      <SvgText x={PAD.left - 5} y={PAD.top + 4} textAnchor="end" fontSize={8} fill={Theme.textMuted}>
        {formatINRChip(maxVal)}
      </SvgText>
      <SvgText x={PAD.left - 5} y={height - PAD.bottom + 8} textAnchor="end" fontSize={8} fill={Theme.textMuted}>
        -{formatINRChip(maxVal)}
      </SvgText>
    </Svg>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: ExpenseCat[];
  size?: number;
}

export function DonutChart({ data, size = 90 }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.4;
  const innerR = size * 0.25;

  const total = data.reduce((s, d) => s + d.amount, 0);

  const trigger = data.map((d) => d.label + d.amount).join(",");
  const entrance = useEntranceAnim(trigger, 600);
  const scale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const segments = useMemo(() => {
    let angle = -Math.PI / 2;
    return data.map((d) => {
      const slice = total > 0 ? (d.amount / total) * (2 * Math.PI) : 0;
      const start = angle;
      angle += slice;
      return { ...d, startAngle: start, endAngle: angle };
    });
  }, [data, total]);

  function arcPath(start: number, end: number): string {
    if (Math.abs(end - start) < 0.001) return "";
    const x1 = cx + outerR * Math.cos(start);
    const y1 = cy + outerR * Math.sin(start);
    const x2 = cx + outerR * Math.cos(end);
    const y2 = cy + outerR * Math.sin(end);
    const ix1 = cx + innerR * Math.cos(end);
    const iy1 = cy + innerR * Math.sin(end);
    const ix2 = cx + innerR * Math.cos(start);
    const iy2 = cy + innerR * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)} Z`;
  }

  return (
    <Animated.View style={{ opacity: entrance, transform: [{ scale }] }}>
      <Svg width={size} height={size}>
        {segments.length === 0 ? (
          <Circle cx={cx} cy={cy} r={outerR} fill={Theme.surfaceGray} />
        ) : (
          segments.map((seg, i) => {
            const d = arcPath(seg.startAngle, seg.endAngle);
            return d ? <Path key={i} d={d} fill={seg.color} /> : null;
          })
        )}
        {/* Inner white circle for donut hole */}
        <Circle cx={cx} cy={cy} r={innerR - 2} fill={Theme.screenBackground} />
      </Svg>
    </Animated.View>
  );
}

// ─── Utilization ring ─────────────────────────────────────────────────────────

interface UtilizationRingProps {
  pct: number; // 0–100
  size?: number;
  color?: string;
}

export function UtilizationRing({ pct, size = 72, color = Theme.primary }: UtilizationRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeW = size * 0.1;
  const circumference = 2 * Math.PI * r;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const finalOffset = circumference * (1 - clampedPct / 100);

  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    ringAnim.setValue(0);
    Animated.timing(ringAnim, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const dashOffset = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, finalOffset],
  });

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={Theme.surfaceGray}
        strokeWidth={strokeW}
      />
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${circumference}`}
        strokeDashoffset={dashOffset as any}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx},${cy}`}
      />
    </Svg>
  );
}

// ─── Legend row component ─────────────────────────────────────────────────────

interface LegendRowProps {
  items: ExpenseCat[];
}

export function ExpenseLegend({ items }: LegendRowProps) {
  return (
    <View style={legendStyles.wrap}>
      {items.map((item) => (
        <View key={item.label} style={legendStyles.row}>
          <View style={[legendStyles.dot, { backgroundColor: item.color }]} />
          <Text style={legendStyles.label} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={legendStyles.pct}>{item.pct.toFixed(0)}%</Text>
        </View>
      ))}
    </View>
  );
}

const legendStyles = StyleSheet.create({
  wrap: { gap: 6, flex: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  label: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  pct: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    minWidth: 30,
    textAlign: "right",
  },
});
