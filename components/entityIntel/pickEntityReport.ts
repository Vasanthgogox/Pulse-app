import { ActionSheetIOS, Alert, Platform } from "react-native";

export type EntityReportOption = {
  id: string;
  label: string;
};

export function pickEntityReport(
  title: string,
  options: EntityReportOption[],
  onPick: (id: string) => void,
): void {
  if (options.length === 0) return;
  if (options.length === 1) {
    onPick(options[0]!.id);
    return;
  }
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), "Cancel"],
        cancelButtonIndex: options.length,
      },
      (index) => {
        if (index == null || index < 0 || index >= options.length) return;
        onPick(options[index]!.id);
      },
    );
    return;
  }
  Alert.alert(
    title,
    undefined,
    [
      ...options.map((o) => ({
        text: o.label,
        onPress: () => onPick(o.id),
      })),
      { text: "Cancel", style: "cancel" as const },
    ],
    { cancelable: true },
  );
}
