/**
 * Desktop popup — mobile GPay partner-rate keypad (keyboard + on-screen keys).
 */
import { memo, useEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WizardActionBarProvider } from "@/components/full-page-wizard";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import Theme from "@/constants/Theme";
import { PartnerRatesKeypadFlow } from "@/features/trips/components/allocation/PartnerRatesKeypadFlow";
import { platformShadow } from "@/lib/platformShadow";

const SHEET_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export type PartnerRateDesktopModalProps = {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  partnerRate: string;
  onPartnerRateChange: (value: string) => void;
  advancePaid: string;
  onAdvancePaidChange: (value: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  onChangePartner?: () => void;
  rateError?: boolean;
  advanceError?: boolean;
  /** Client sale value for live margin while typing partner rate. */
  saleValue?: string;
};

export const PartnerRateDesktopModal = memo(function PartnerRateDesktopModal({
  visible,
  onClose,
  onDone,
  partnerRate,
  onPartnerRateChange,
  advancePaid,
  onAdvancePaidChange,
  partyPreview,
  onChangePartner,
  rateError = false,
  advanceError = false,
  saleValue,
}: PartnerRateDesktopModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetMaxH = Math.min(720, Math.round(height * 0.92));

  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, onClose, onDone]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 200 }}
          style={styles.backdrop}
          pointerEvents="none"
        />
        <MotiView
          key={visible ? "open" : "closed"}
          from={{ opacity: 0, scale: 0.94, translateY: 28 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 320, easing: SHEET_EASE }}
          style={[
            styles.sheet,
            { maxHeight: sheetMaxH },
            Platform.OS === "web" ? styles.sheetWebHug : null,
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetEyebrow}>Partner cost</Text>
              <Text style={styles.sheetTitle}>Enter partner rate</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <X size={16} color={Theme.textRouteCard} strokeWidth={2.25} />
            </Pressable>
          </View>

          <WizardActionBarProvider
            value={
              <View style={styles.sheetFooter}>
                <Text style={styles.keyboardHint}>
                  Type on your keyboard or use the keypad
                </Text>
                <Pressable
                  onPress={onDone}
                  style={styles.doneBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            }
          >
            <View style={styles.keypadHost}>
              <PartnerRatesKeypadFlow
                wizardShell
                forceMobileLayout
                compact
                partnerRate={partnerRate}
                onPartnerRateChange={onPartnerRateChange}
                advancePaid={advancePaid}
                onAdvancePaidChange={onAdvancePaidChange}
                partyPreview={partyPreview}
                onPartyPress={onChangePartner}
                saleValue={saleValue}
                rateErrorMessage={rateError ? "Enter partner rate" : undefined}
                advanceErrorMessage={
                  advanceError ? "Invalid advance amount" : undefined
                }
              />
            </View>
          </WizardActionBarProvider>
        </MotiView>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "center",
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...platformShadow("0 20px 40px rgba(15, 23, 42, 0.18)", {
      color: Theme.shadow,
      opacity: 0.18,
      radius: 28,
      offsetY: 16,
      elevation: 14,
    }),
  },
  /** Cap via maxHeight only — do not stretch to fill the overlay. */
  sheetWebHug: {
    height: "auto",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sheetEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  keypadHost: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  sheetFooter: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  keyboardHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  doneBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: Theme.textPrimaryDark,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
