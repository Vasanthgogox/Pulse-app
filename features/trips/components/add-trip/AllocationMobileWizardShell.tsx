/**
 * Mobile Create Trip / indent — allocation sub-steps (one screen at a time, flex-safe).
 */
import { fullPageWizardStyles } from "@/components/full-page-wizard";
import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export interface AllocationMobileWizardShellProps {
  /** Progress is rendered by the parent shell header */
  progressSteps?: readonly { id: string; label: string }[];
  currentStepId?: string;
  fillBody?: boolean;
  /** Desktop stepped wizard — flat body inside parent step surface. */
  desktop?: boolean;
  children: ReactNode;
}

export const AllocationMobileWizardShell = memo(function AllocationMobileWizardShell({
  fillBody = false,
  desktop = false,
  children,
}: AllocationMobileWizardShellProps) {
  if (desktop) {
    return <View style={{ width: "100%" }}>{children}</View>;
  }

  return (
    <View
      style={[
        styles.stage,
        fillBody && styles.stageFill,
        !fillBody && fullPageWizardStyles.wizardStepContentFlat,
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    gap: 12,
  },
  stageFill: {
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
});
