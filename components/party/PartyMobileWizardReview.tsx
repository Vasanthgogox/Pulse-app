/**
 * Confirm / review step for party mobile & desktop wizards.
 * Entrance: backdrop fade, card spring-in, staggered content, soft icon pulse.
 */
import { memo, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";

import Theme from "@/constants/Theme";
import { partyMobileWizardStyles as styles } from "./partyMobileWizardStyles";

const REVIEW_CONFIRMATION_ANIMATION = require("@/assets/Animated folder/note-saved.json");

export interface PartyMobileWizardReviewProps {
  onBackToEdit: () => void;
  summaryContent: ReactNode;
  footerExtra?: ReactNode;
  reviewSaveLabel: string;
  submitting: boolean;
  organizationId: string | null;
  onConfirm: () => void;
  title?: string;
  message?: string;
}

export const PartyMobileWizardReview = memo(function PartyMobileWizardReview({
  onBackToEdit,
  summaryContent,
  footerExtra,
  reviewSaveLabel,
  submitting,
  organizationId,
  onConfirm,
  title = "Confirm details",
  message = "Review the summary below, then save to add this record to your organization.",
}: PartyMobileWizardReviewProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const summaryMaxHeight = Math.min(280, Math.round(windowHeight * 0.34));

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardTranslateY = useRef(new Animated.Value(18)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(10)).current;
  const summaryOpacity = useRef(new Animated.Value(0)).current;
  const summaryTranslateY = useRef(new Animated.Value(12)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(10)).current;
  const savePress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 68,
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.stagger(90, [
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(summaryOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(summaryTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [
    overlayOpacity,
    cardOpacity,
    cardScale,
    cardTranslateY,
    iconPulse,
    heroOpacity,
    heroTranslateY,
    summaryOpacity,
    summaryTranslateY,
    actionsOpacity,
    actionsTranslateY,
  ]);

  const onSavePressIn = () => {
    Animated.spring(savePress, {
      toValue: 0.97,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };
  const onSavePressOut = () => {
    Animated.spring(savePress, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.reviewOverlay,
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
          opacity: overlayOpacity,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.reviewCard,
          {
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.reviewHeroBlock,
            {
              opacity: heroOpacity,
              transform: [{ translateY: heroTranslateY }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.reviewAnimationWrap,
              { transform: [{ scale: iconPulse }] },
            ]}
          >
            <LottieView
              source={REVIEW_CONFIRMATION_ANIMATION}
              autoPlay
              loop={false}
              resizeMode="contain"
              style={styles.reviewAnimation}
            />
          </Animated.View>
          <Text style={styles.reviewCardTitle}>{title}</Text>
          <Text style={styles.reviewCardMessage}>{message}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.reviewSummaryBlock,
            {
              opacity: summaryOpacity,
              transform: [{ translateY: summaryTranslateY }],
            },
          ]}
        >
          <ScrollView
            style={[styles.reviewSummaryScroll, { maxHeight: summaryMaxHeight }]}
            contentContainerStyle={styles.reviewSummaryScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {summaryContent}
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={[
            styles.reviewActionsBlock,
            {
              opacity: actionsOpacity,
              transform: [{ translateY: actionsTranslateY }],
            },
          ]}
        >
          {footerExtra ? (
            <View style={styles.reviewFooterExtra}>{footerExtra}</View>
          ) : null}
          <Animated.View style={{ transform: [{ scale: savePress }], width: "100%" }}>
            <Pressable
              style={[
                styles.reviewConfirmBtn,
                (!organizationId || submitting) && styles.reviewConfirmBtnDisabled,
              ]}
              onPress={onConfirm}
              onPressIn={onSavePressIn}
              onPressOut={onSavePressOut}
              disabled={!organizationId || submitting}
              testID="party-save-btn"
            >
              {submitting ? (
                <ActivityIndicator color={Theme.buttonPrimaryText} />
              ) : (
                <Text style={styles.reviewConfirmBtnText}>{reviewSaveLabel}</Text>
              )}
            </Pressable>
          </Animated.View>
          <Pressable
            style={styles.reviewEditLink}
            onPress={onBackToEdit}
            hitSlop={8}
            testID="party-edit-details-btn"
          >
            <Text style={styles.reviewEditLinkText}>← Edit details</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
});
