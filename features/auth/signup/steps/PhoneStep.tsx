import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { OperationalButton } from '@/components/operational';
import {
  OnboardingKeypadLinkRow,
  OnboardingKeypadStep,
  OnboardingFullPageFormStep,
} from '@/features/onboarding';
import { ROUTES } from '@/lib/routes';
import { colors } from '@/design-system/colors';
import { OnboardingFocusedField } from '@/features/onboarding/components/OnboardingFocusedField';
import { OnboardingKeypadAltRow } from '@/features/onboarding/components/OnboardingKeypadAltRow';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { formatSignupPhoneDisplay } from '../signUpKeypad.util';

export function PhoneStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();

  if (flow.useMobileLayout) {
    const hint = flow.phoneExistsCheck?.loading
      ? 'Checking number…'
      : !flow.phoneExistsCheck?.loading && flow.phoneExistsCheck?.exists
        ? 'This number is already registered.'
        : null;

    return (
      <OnboardingKeypadStep
        title="Your mobile number"
        subtitle="We'll send a verification code to activate your operator workspace."
        value={flow.phone}
        onChange={flow.setPhone}
        maxDigits={10}
        formatDisplay={formatSignupPhoneDisplay}
        displayFlag="🇮🇳"
        displayPrefix="+91"
        emptyPlaceholder="000 000 0000"
        onPrimary={flow.continuePhone}
        primaryDisabled={
          !flow.phoneValid ||
          !!flow.phoneExistsCheck?.loading ||
          !!(flow.phoneExistsCheck?.exists && !flow.phoneExistsCheck?.loading)
        }
        primaryLoading={flow.loading || !!flow.phoneExistsCheck?.loading}
        primaryButtonLabel="Send verification code"
        errorMessage={flow.phoneInlineError}
        hintMessage={hint}
        footerAccessory={
          <OnboardingKeypadLinkRow
            links={[
              {
                label: 'Continue with Google',
                onPress: flow.continueWithGoogleFromWelcome,
                disabled: flow.loading || flow.googleLoading || !flow.isOnline,
              },
              {
                label: 'Sign in',
                onPress: () => router.replace(ROUTES.SIGN_IN),
              },
            ]}
          />
        }
      />
    );
  }

  return (
    <OnboardingFullPageFormStep
      title="Your mobile number"
      subtitle="We'll send a verification code to activate your operator workspace."
      primaryLabel="Send verification code"
      onPrimary={flow.continuePhone}
      primaryDisabled={
        !flow.phoneValid ||
        flow.loading ||
        !!flow.phoneExistsCheck?.loading
      }
      primaryLoading={flow.loading || !!flow.phoneExistsCheck?.loading}
      footerAccessory={
        <OnboardingKeypadAltRow>
          <OperationalButton
            intent="utility"
            label="Continue with Google"
            onPress={flow.continueWithGoogleFromWelcome}
            disabled={flow.loading || flow.googleLoading || !flow.isOnline}
            loading={flow.googleLoading}
            fullWidth
            icon={<FontAwesome name="google" size={14} color={colors.textPrimary} />}
          />
        </OnboardingKeypadAltRow>
      }
      secondaryAction={{
        label: 'Already activated? Sign in',
        onPress: () => router.replace(ROUTES.SIGN_IN),
      }}
    >
      <OnboardingFocusedField
        label="Mobile number"
        value={flow.phone}
        onChangeText={flow.setPhone}
        keyboardType="phone-pad"
        maxLength={10}
        editable={!flow.loading}
        errorMessage={flow.phoneInlineError ?? undefined}
        hintMessage={
          flow.phoneExistsCheck?.loading
            ? 'Checking…'
            : flow.phoneExistsCheck?.exists
              ? 'This number is already registered.'
              : undefined
        }
      />
    </OnboardingFullPageFormStep>
  );
}
