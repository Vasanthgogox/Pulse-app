import React from 'react';
import { Platform, View } from 'react-native';

import { styles } from './businessSignUp.styles';
import { useBusinessSignUpFlow } from './hooks/useBusinessSignUpFlow';
import { STEP_LABELS } from './signUpConstants';
import { SignUpPulseShell } from './SignUpPulseShell';
import { AccountStep } from './steps/AccountStep';
import { CompanyDetailsStep } from './steps/CompanyDetailsStep';
import { CompanyLocationStep } from './steps/CompanyLocationStep';
import { OrgLogoStep } from './steps/OrgLogoStep';
import { OrgStep } from './steps/OrgStep';
import { OtpStep } from './steps/OtpStep';
import { PhoneStep } from './steps/PhoneStep';
import { ProfilePhotoStep } from './steps/ProfilePhotoStep';
import { SuccessStep } from './steps/SuccessStep';

function BusinessStepContent({
  flow,
  step,
}: {
  flow: ReturnType<typeof useBusinessSignUpFlow>;
  step: number;
}) {
  switch (step) {
    case 0:
      return <PhoneStep flow={flow} />;
    case 1:
      return <OtpStep flow={flow} />;
    case 2:
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
  const backLabel = flow.step === 0 ? 'Back' : flow.step === 8 ? '' : 'Back';

  return (
    <SignUpPulseShell
      backLabel={backLabel || 'Back'}
      onBack={flow.handleBack}
      stepLabels={STEP_LABELS}
      currentStepIndex={Math.min(flow.step, STEP_LABELS.length - 1)}
      hideProgress={flow.step >= 8}
      isDesktop={flow.isDesktop && Platform.OS !== 'web'}
    >
      <View style={styles.mobileStepFlex}>
        <BusinessStepContent flow={flow} step={flow.step} />
      </View>
    </SignUpPulseShell>
  );
}
