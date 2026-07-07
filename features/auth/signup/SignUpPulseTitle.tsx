import { memo, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DESKTOP_BREAKPOINT } from './signUpConstants';
import { PULSE_SIGNUP } from './signUpPulseTheme';
import { createPulseSignUpTextStyles } from './signUpTypography';

export interface SignUpPulseTitleProps {
  title: string;
  subtitle?: string | ReactNode;
  centered?: boolean;
  compact?: boolean;
}

export const SignUpPulseTitle = memo(function SignUpPulseTitle({
  title,
  subtitle,
  centered = true,
  compact = false,
}: SignUpPulseTitleProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const text = createPulseSignUpTextStyles(PULSE_SIGNUP);

  return (
    <View style={[styles.wrap, centered && styles.centered, compact && styles.wrapCompact]}>
      <Text
        style={[
          text.title,
          isDesktop && text.titleDesktop,
          compact && text.titleCompact,
          !centered && styles.titleLeft,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text
            style={[
              text.subtitle,
              isDesktop && text.subtitleDesktop,
              compact && text.subtitleCompact,
              !centered && styles.subtitleLeft,
            ]}
          >
            {subtitle}
          </Text>
        ) : (
          subtitle
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Platform.OS === 'web' ? 14 : 20,
  },
  wrapCompact: {
    marginBottom: Platform.OS === 'web' ? 12 : 16,
  },
  centered: {
    alignItems: 'center',
  },
  titleLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  subtitleLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
    maxWidth: undefined,
  },
});
