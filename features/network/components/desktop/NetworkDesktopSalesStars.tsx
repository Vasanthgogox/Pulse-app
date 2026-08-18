import Theme from "@/constants/Theme";
import { Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  filledStars: number;
  size?: number;
};

function ratingFilledCount(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

export function NetworkDesktopSalesStars({ filledStars, size = 12 }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, idx) => (
        <Star
          key={`sales-star-${idx}`}
          size={size}
          color={idx < filledStars ? Theme.driverGold : Theme.borderMedium}
          fill={idx < filledStars ? Theme.driverGold : "transparent"}
          strokeWidth={1.6}
        />
      ))}
    </View>
  );
}

/** Stars + numeric score, centered under a profile avatar. */
export function NetworkProfileAvatarRating({
  rating,
  size = 11,
  compact = false,
  variant = "stars",
}: {
  rating: number | null | undefined;
  size?: number;
  compact?: boolean;
  /** `single` = one gold star + score (top-left chip). */
  variant?: "stars" | "single";
}) {
  const empty = rating == null || !Number.isFinite(rating) || rating <= 0;
  const filledStars = ratingFilledCount(rating);
  const label = empty ? "—" : Number(rating).toFixed(1);
  if (variant === "single") {
    const starSize = empty ? Math.max(16, size - 4) : size;
    return (
      <View
        style={[styles.singleChip, empty && styles.singleChipEmpty]}
        accessibilityRole="text"
        accessibilityLabel={empty ? "No rating" : `${label} rating`}
      >
        <Star
          size={starSize}
          color={empty ? Theme.borderMedium : Theme.driverGold}
          fill={empty ? "transparent" : Theme.driverGold}
          strokeWidth={empty ? 1.8 : 0}
        />
        <Text
          style={[styles.singleScore, empty && styles.noRatingLabel]}
          numberOfLines={empty ? 2 : 1}
        >
          {empty ? "No rating" : label}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={styles.avatarRating}
      accessibilityRole="text"
      accessibilityLabel={empty ? "No rating" : `${label} rating`}
    >
      <Text
        style={[
          styles.avatarRatingText,
          styles.avatarRatingSlot,
          empty && styles.avatarRatingTextEmpty,
          styles.avatarRatingSpacer,
        ]}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {label}
      </Text>
      <NetworkDesktopSalesStars
        filledStars={filledStars}
        size={compact ? Math.max(8, size - 1) : size}
      />
      <Text
        style={[
          styles.avatarRatingText,
          styles.avatarRatingSlot,
          empty && styles.avatarRatingTextEmpty,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  avatarRating: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 6,
  },
  singleChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  singleChipEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  singleScore: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.4,
    includeFontPadding: false,
    lineHeight: 22,
  },
  noRatingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
    fontVariant: [],
    lineHeight: 14,
  },
  avatarRatingSlot: {
    textAlign: "left",
  },
  avatarRatingSpacer: {
    opacity: 0,
  },
  avatarRatingText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  avatarRatingTextEmpty: {
    color: Theme.textSecondary,
    fontWeight: "600",
  },
});
