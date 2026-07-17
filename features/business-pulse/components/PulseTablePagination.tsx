import { Pressable, Text, View } from "react-native";

import { pulseTableStyles as tbl } from "@/features/business-pulse/components/pulseTableStyles";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PulseTablePagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i);

  return (
    <View style={tbl.footer}>
      <Text style={tbl.footerMeta}>
        {start} – {end} of {total}
      </Text>
      <View style={tbl.footerNav}>
        <Pressable
          style={[tbl.footerNavBtn, !canPrev && { opacity: 0.4 }]}
          onPress={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
        >
          <Text style={tbl.footerNavBtnText}>‹</Text>
        </Pressable>
        {pages.map((p) => {
          const active = p === page;
          return (
            <Pressable
              key={p}
              style={[tbl.footerNavBtn, active && tbl.footerNavBtnActive]}
              onPress={() => onPageChange(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[tbl.footerNavBtnText, active && tbl.footerNavBtnTextActive]}>
                {p + 1}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[tbl.footerNavBtn, !canNext && { opacity: 0.4 }]}
          onPress={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel="Next page"
        >
          <Text style={tbl.footerNavBtnText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}
