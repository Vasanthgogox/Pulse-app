import { StyleSheet, Text } from 'react-native';

import type { OperatingModel } from '@/features/auth/services/auth.service';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import type { BusinessType, EmployeeCount, FleetSize, MonthlyVolume } from '../signUpConstants';
import {
  BUSINESS_TYPES,
  EMPLOYEE_COUNTS,
  FLEET_SIZES,
  MONTHLY_VOLUMES,
  OPERATING_MODELS,
} from '../signUpConstants';
import { SignUpPillSelect } from '../SignUpPillSelect';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function CompanyDetailsStep({ flow }: { flow: SignUpFlow }) {
  return (
    <SignUpPulseFormStep
      title="Company details"
      subtitle={
        <Text style={styles.subtitle}>
          Tell us about{' '}
          <Text style={styles.orgHighlight}>{flow.orgName || 'your company'}</Text>
        </Text>
      }
      primaryLabel="Continue"
      onPrimary={flow.continueCompanyDetails}
      primaryDisabled={
        !flow.operatingModel ||
        !flow.businessType ||
        !flow.employeeCount ||
        (flow.operatingModel === 'ASSET_BASED' || flow.operatingModel === 'HYBRID'
          ? !flow.fleetSize
          : false) ||
        (flow.operatingModel === 'NON_ASSET' || flow.operatingModel === 'HYBRID'
          ? !flow.monthlyVolume
          : false)
      }
    >
      <SignUpPillSelect<OperatingModel>
        label="How do you operate?"
        required
        options={OPERATING_MODELS.map((m) => ({
          value: m.value,
          label: m.label,
          sub: m.sub,
        }))}
        value={flow.operatingModel}
        onChange={flow.setOperatingModel}
      />

      <SignUpPillSelect<BusinessType>
        label="Business Structure"
        required
        options={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
        value={flow.businessType}
        onChange={flow.setBusinessType}
        error={flow.step3Attempted ? flow.step3Errors.businessType : null}
      />

      {(flow.operatingModel === 'ASSET_BASED' || flow.operatingModel === 'HYBRID') && (
        <SignUpPillSelect<FleetSize>
          label={
            flow.operatingModel === 'HYBRID'
              ? 'Own Fleet Size (Trucks)'
              : 'Own Fleet Size (Trucks)'
          }
          required
          options={FLEET_SIZES}
          value={flow.fleetSize}
          onChange={flow.setFleetSize}
          error={flow.step3Attempted ? flow.step3Errors.fleetSize : null}
        />
      )}

      {(flow.operatingModel === 'NON_ASSET' || flow.operatingModel === 'HYBRID') && (
        <SignUpPillSelect<MonthlyVolume>
          label="Shipments Arranged Per Month"
          required
          options={MONTHLY_VOLUMES.map((v) => ({ value: v.value, label: v.label }))}
          value={flow.monthlyVolume}
          onChange={flow.setMonthlyVolume}
          error={flow.step3Attempted ? flow.step3Errors.monthlyVolume : null}
        />
      )}

      <SignUpPillSelect<EmployeeCount>
        label="Number of Employees"
        required
        options={EMPLOYEE_COUNTS}
        value={flow.employeeCount}
        onChange={flow.setEmployeeCount}
        error={flow.step3Attempted ? flow.step3Errors.employeeCount : null}
      />
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: PULSE_SIGNUP.muted,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  orgHighlight: {
    fontWeight: '900',
    color: PULSE_SIGNUP.primary,
  },
});
