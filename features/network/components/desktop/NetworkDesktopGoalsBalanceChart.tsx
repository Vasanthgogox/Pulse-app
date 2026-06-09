/**
 * Dual-series balance trend — receivable vs payable by month.
 */
import Theme from "@/constants/Theme";
import type { BalanceTrendPoint } from "@/features/network/utils/connectionGoalsAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

const PAD = { top: 14, right: 10, bottom: 26, left: 44 };
const RECEIVABLE_COLOR = "#3E97FF";
const PAYABLE_COLOR = "#F1416C";

function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const dx = (p1.x - p0.x) * 0.4;
    d += ` C ${(p0.x + dx).toFixed(2)} ${p0.y.toFixed(2)}, ${(p1.x - dx).toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

type Props = {
  data: BalanceTrendPoint[];
  width: number;
  height?: number;
};

export function NetworkDesktopGoalsBalanceChart({
  data,
  width,
  height = 148,
}: Props) {
  const chart = useMemo(() => {
    const innerW = Math.max(120, width - PAD.left - PAD.right);
    const innerH = Math.max(60, height - PAD.top - PAD.bottom);
    const maxVal = Math.max(
      1,
      ...data.map((d) => Math.max(d.receivable, d.payable)),
    );
    const yFor = (v: number) =>
      PAD.top + innerH - (v / maxVal) * innerH;
    const xFor = (i: number) =>
      PAD.left +
      (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);

    const recvPts = data.map((d, i) => ({
      x: xFor(i),
      y: yFor(d.receivable),
    }));
    const payPts = data.map((d, i) => ({
      x: xFor(i),
      y: yFor(d.payable),
    }));

    const gridSteps = 5;
    const gridLines = Array.from({ length: gridSteps + 1 }).map((_, i) => {
      const y = PAD.top + (innerH / gridSteps) * i;
      const val = maxVal - (maxVal / gridSteps) * i;
      return { y, label: formatINRChip(val) };
    });

    return {
      recvPath: smoothLinePath(recvPts),
      payPath: smoothLinePath(payPts),
      recvPts,
      payPts,
      gridLines,
      baseY: PAD.top + innerH,
    };
  }, [data, width, height]);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No balance trend for this period.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: RECEIVABLE_COLOR }]} />
          <Text style={styles.legendText}>Receivable</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: PAYABLE_COLOR }]} />
          <Text style={styles.legendText}>Payable</Text>
        </View>
      </View>
      <Svg width={width} height={height}>
        {chart.gridLines.map((line, i) => (
          <G key={`grid-${i}`}>
            <Line
              x1={PAD.left}
              y1={line.y}
              x2={width - PAD.right}
              y2={line.y}
              stroke="#EFF2F5"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <SvgText
              x={PAD.left - 6}
              y={line.y + 4}
              fontSize={9}
              fill="#A1A5B7"
              textAnchor="end"
            >
              {line.label}
            </SvgText>
          </G>
        ))}
        <Path
          d={chart.recvPath}
          stroke={RECEIVABLE_COLOR}
          strokeWidth={2.5}
          fill="none"
        />
        <Path
          d={chart.payPath}
          stroke={PAYABLE_COLOR}
          strokeWidth={2.5}
          fill="none"
        />
        {chart.recvPts.map((p, i) => (
          <Circle
            key={`recv-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={RECEIVABLE_COLOR}
          />
        ))}
        {data.map((d, i) => (
          <SvgText
            key={`lbl-${d.monthKey}`}
            x={chart.recvPts[i]?.x ?? PAD.left}
            y={height - 6}
            fontSize={9}
            fill="#A1A5B7"
            textAnchor="middle"
          >
            {d.label.split(" ")[0]}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  legend: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#78829D",
  },
  empty: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
});
