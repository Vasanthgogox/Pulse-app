import React from 'react';
import { View } from 'react-native';

import { useSuiteAuthContext } from '@/features/auth/hooks/useSuiteAuthContext';
import { suiteSignUpCopy } from '@/lib/suite/suiteAuthContent';

import { styles } from './businessSignUp.styles';
import { useBusinessSignUpFlow } from './hooks/useBusinessSignUpFlow';
import { STEP_LABELS } from './signUpConstants';
import { SignUpPulseShell } from './SignUpPulseShell';
import { AccountStep } from './steps/AccountStep';
import { CompanyDetailsStep } from './steps/CompanyDetailsStep';
import { CompanyLocationStep } from './steps/CompanyLocationStep';
import { InvitePickerStep } from './steps/InvitePickerStep';
import { InviteAcceptanceStep } from './steps/InviteAcceptanceStep';
import { InviteExistingAccountStep } from './steps/InviteExistingAccountStep';
import { InviteExpiredStep } from './steps/InviteExpiredStep';
import { InviteNotFoundStep } from './steps/InviteNotFoundStep';
import { OrgLogoStep } from './steps/OrgLogoStep';
import { OrgStep } from './steps/OrgStep';
import { OtpStep } from './steps/OtpStep';
import { PhoneStep } from './steps/PhoneStep';
import { ProfilePhotoStep } from './steps/ProfilePhotoStep';
import { SuccessStep } from './steps/SuccessStep';
import { WorkspaceIntroStep } from './steps/WorkspaceIntroStep';

function BusinessStepContent({
  flow,
  step,
}: {
  flow: ReturnType<typeof useBusinessSignUpFlow>;
  step: number;
}) {
  switch (step) {
    case 0:
      if (flow.showIntro) return <WorkspaceIntroStep flow={flow} />;
      return <PhoneStep flow={flow} />;
    case 1:
      return <OtpStep flow={flow} />;
    case 2:
      if (flow.signupTrack === 'invite') {
        if (flow.invitePhase === 'picker') return <InvitePickerStep flow={flow} />;
        if (flow.invitePhase === 'expired') return <InviteExpiredStep flow={flow} />;
        if (flow.invitePhase === 'no_invite') return <InviteNotFoundStep flow={flow} />;
        if (flow.invitePhase === 'existing_account') return <InviteExistingAccountStep flow={flow} />;
        return <InviteAcceptanceStep flow={flow} />;
      }
      return <OrgStep flow={flow} />;
    case 3:
      return <CompanyDetailsStep flow={flow} />;
    case 4:
      return <CompanyLocationStep flow={flow} />;
    case 5:
      return <AccountStep flow={flow} />;
    case 6:
      return <OrgLogoStep flow={flow} />;
    case 7:
      return <ProfilePhotoStep flow={flow} />;
    case 8:
      return <SuccessStep flow={flow} />;
    default:
      return null;
  }
}

export default function BusinessSignUpScreen() {
  const flow = useBusinessSignUpFlow();
  const { productId, product } = useSuiteAuthContext();
  const signUpCopy = suiteSignUpCopy(productId);
  const backLabel = flow.step === 0 ? 'Back' : flow.step === 8 ? '' : 'Back';

  return (
    <View style={styles.screenRoot}>
      <SignUpPulseShell
        backLabel={backLabel || 'Back'}
        onBack={flow.handleBack}
        stepLabels={STEP_LABELS}
        currentStepIndex={Math.min(flow.step, STEP_LABELS.length - 1)}
        hideProgress={
          flow.showIntro ||
          flow.step >= 8 ||
          flow.signupTrack === 'invite' ||
          (flow.useMobileLayout && !flow.showIntro && (flow.step === 0 || flow.step === 1))
        }
        isDesktop={flow.isDesktop}
        brandWord={product.brandWord}
        marketingTag={signUpCopy.marketingTag}
        marketingTitle={signUpCopy.marketingTitle}
        marketingOutcomeLines={signUpCopy.principles}
      >
        <View style={styles.mobileStepFlex}>
          <BusinessStepContent flow={flow} step={flow.step} />
        </View>
      </SignUpPulseShell>
    </View>
  );
}
