import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, styles } from './businessSignUp.styles';
import { STEP_LABELS, useBusinessSignUpFlow } from './hooks/useBusinessSignUpFlow';
import { AccountStep } from './steps/AccountStep';
import { CompanyDetailsStep } from './steps/CompanyDetailsStep';
import { OrgStep } from './steps/OrgStep';
import { OtpStep } from './steps/OtpStep';
import { PhoneStep } from './steps/PhoneStep';
import { SuccessStep } from './steps/SuccessStep';
import { SCROLL_BOTTOM_PAD } from './signUpConstants';

type PageBodyProps = {
  pageIndex: number;
  pageWidth: number;
  bottomPad: number;
  scrollRef: (el: ScrollView | null) => void;
  children: React.ReactNode;
};

/** Memoised so only the page whose props change re-renders on each keystroke. */
const PageBody = React.memo(function PageBody({
  pageWidth,
  bottomPad,
  scrollRef,
  children,
}: PageBodyProps) {
  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.pageScroll}
        contentContainerStyle={[styles.pageInner, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </View>
  );
});

export default function BusinessSignUpScreen() {
  const insets = useSafeAreaInsets();
  const flow = useBusinessSignUpFlow();

  const bottomPad = insets.bottom + SCROLL_BOTTOM_PAD;
  const backLabel = flow.step === 0 ? 'Back' : flow.step === 5 ? '' : 'Previous';

  const makeScrollRef = (i: number) => (el: ScrollView | null) => {
    flow.pageVerticalScrollRefs.current[i] = el;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {flow.step < 5 ? (
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={flow.handleBack} hitSlop={12}>
            <FontAwesome name="chevron-left" size={16} color={C.muted} />
            <Text style={styles.backBtnText}>{backLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.brandText}>PULSE.</Text>
          <View style={styles.topBarRight} />
        </View>
      ) : null}

      <View style={flow.isDesktop ? styles.panelShell : styles.mobileShell}>
        {flow.isDesktop ? (
          <View style={styles.leftPanel}>
            <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
            <Text style={styles.leftTag}>Business Onboarding</Text>
            <Text style={styles.leftTitle}>Build your workspace.</Text>
            <Text style={styles.leftSub}>Organize your fleet and logistics with Pulse.</Text>
          </View>
        ) : null}

        <View style={flow.isDesktop ? styles.rightPanel : styles.mobileRight}>
          <ScrollView
            ref={flow.scrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={[styles.scroller, flow.isDesktop && { width: flow.pageWidth, alignSelf: 'center' }]}
            contentContainerStyle={styles.scrollerContent}
            keyboardShouldPersistTaps="handled"
          >
            <PageBody pageIndex={0} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(0)}>
              <PhoneStep flow={flow} />
            </PageBody>

            <PageBody pageIndex={1} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(1)}>
              <OtpStep flow={flow} />
            </PageBody>

            <PageBody pageIndex={2} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(2)}>
              <OrgStep flow={flow} />
            </PageBody>

            <PageBody pageIndex={3} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(3)}>
              <CompanyDetailsStep flow={flow} />
            </PageBody>

            <PageBody pageIndex={4} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(4)}>
              <AccountStep flow={flow} />
            </PageBody>

            <PageBody pageIndex={5} pageWidth={flow.pageWidth} bottomPad={bottomPad} scrollRef={makeScrollRef(5)}>
              <SuccessStep flow={flow} />
            </PageBody>
          </ScrollView>

          {flow.step < 5 ? (
            <View style={[styles.dotsRow, { paddingBottom: insets.bottom + 10 }]}>
              {STEP_LABELS.map((label, i) => {
                const done = i < flow.step;
                const active = i === flow.step;
                return (
                  <View key={label} style={styles.dotItem}>
                    <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]} />
                    <Text style={[styles.dotLabel, active && styles.dotLabelActive]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
