import { memo, type ReactNode } from 'react';
import { Text } from 'react-native';

import { SIGNUP_TEXT } from './signUpTypography';

export interface SignUpPulseSubtitleProps {
  children?: ReactNode;
  beforeHighlight?: string;
  highlight?: string;
  afterHighlight?: string;
}

/** Centered subtitle with optional org/name highlight — matches step title rhythm. */
export const SignUpPulseSubtitle = memo(function SignUpPulseSubtitle({
  children,
  beforeHighlight,
  highlight,
  afterHighlight,
}: SignUpPulseSubtitleProps) {
  if (children != null) {
    return <Text style={SIGNUP_TEXT.subtitleCentered}>{children}</Text>;
  }

  return (
    <Text style={SIGNUP_TEXT.subtitleCentered}>
      {beforeHighlight}
      {highlight ? <Text style={SIGNUP_TEXT.highlight}>{highlight}</Text> : null}
      {afterHighlight}
    </Text>
  );
});
