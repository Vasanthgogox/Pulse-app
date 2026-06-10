import Theme from "@/constants/Theme";
import { Star } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

type Props = {
  filledStars: number;
  size?: number;
};

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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
