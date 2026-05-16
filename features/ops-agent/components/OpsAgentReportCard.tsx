import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ChatReportData } from "@/services/opsAgentService";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";

interface OpsAgentReportCardProps {
  report: ChatReportData;
  onDownloadPdf: (report: ChatReportData) => void;
  isDownloading: boolean;
  themeRef: OpsRef;
  styles: OpsAgentStyles;
}

export function OpsAgentReportCard({
  report,
  onDownloadPdf,
  isDownloading,
  themeRef: REF,
  styles,
}: OpsAgentReportCardProps) {
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportCardHeader}>
        <View style={styles.reportIconBox}>
          <Text style={styles.reportIconEmoji}>📊</Text>
        </View>
        <View style={styles.reportTitleBlock}>
          <Text style={styles.reportCardTitle}>{report.title}</Text>
          <Text style={styles.reportCardDate}>
            {new Date(report.generatedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        </View>
      </View>
      <ScrollView
        style={styles.reportCardScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {report.sections.map((sec, idx) => (
          <View key={idx} style={styles.reportSection}>
            <Text style={styles.reportSectionTitle}>{sec.title}</Text>
            {sec.table?.headers?.length ? (
              <View style={styles.reportTable}>
                <View style={styles.reportTableHeaderRow}>
                  {sec.table.headers.map((h, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.reportTableHeaderCell,
                        sec.table!.headers.length === 2 && i === 1 && styles.reportTableCellRight,
                      ]}
                      numberOfLines={1}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {(sec.table.rows ?? []).map((row, ri) => (
                  <View key={ri} style={styles.reportTableRow}>
                    {row.map((cell, ci) => (
                      <Text
                        key={ci}
                        style={[
                          styles.reportTableCell,
                          sec.table!.headers.length === 2 && ci === 1 && styles.reportTableCellRight,
                        ]}
                        numberOfLines={1}
                      >
                        {cell}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.reportSectionBody}>{sec.body}</Text>
            )}
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity
        style={styles.reportDownloadBtn}
        onPress={() => onDownloadPdf(report)}
        activeOpacity={0.8}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <LoadingIndicator size="small" color={REF.amber} />
        ) : (
          <FontAwesome name="file-pdf-o" size={16} color={REF.amber} />
        )}
        <Text style={styles.reportDownloadBtnText}>
          {isDownloading ? "Generating…" : "Download PDF"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
