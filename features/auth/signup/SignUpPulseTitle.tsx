import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  return (
    <View style={[styles.wrap, centered && styles.centered, compact && styles.wrapCompact]}>
      <Text
        style={[
          styles.title,
          compact && styles.titleCompact,
          !centered && styles.titleLeft,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text
            style={[
              styles.subtitle,
              compact && styles.subtitleCompact,
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
    marginBottom: 24,
  },
  wrapCompact: {
    marginBottom: 20,
  },
  centered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 32,
    color: '#111827',
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
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
