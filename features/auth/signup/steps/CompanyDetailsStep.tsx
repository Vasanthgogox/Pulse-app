import type { OperatingModel } from '@/features/auth/services/auth.service';
import {
  OnboardingFullPageFormStep,
  OperationalSelectorGroup,
} from '@/features/onboarding';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import type { BusinessType, EmployeeCount, FleetSize, MonthlyVolume } from '../signUpConstants';
import {
  BUSINESS_TYPES,
  EMPLOYEE_COUNTS,
  FLEET_SIZES,
  MONTHLY_VOLUMES,
  OPERATING_MODELS,
} from '../signUpConstants';

export function CompanyDetailsStep({ flow }: { flow: SignUpFlow }) {
  const fields = (
    <>
      <OperationalSelectorGroup<OperatingModel>
        label="Operating model"
        required
        layout="list"
        options={OPERATING_MODELS.map((m) => ({
          value: m.value,
          label: m.label,
          description: m.sub,
        }))}
        value={flow.operatingModel}
        onChange={flow.setOperatingModel}
      />

      <OperationalSelectorGroup<BusinessType>
        label="Business structure"
        required
        layout="chips"
        options={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
        value={flow.businessType}
        onChange={flow.setBusinessType}
        error={flow.step3Attempted ? flow.step3Errors.businessType : null}
      />

      {(flow.operatingModel === 'ASSET_BASED' || flow.operatingModel === 'HYBRID') && (
        <OperationalSelectorGroup<FleetSize>
          label={
            flow.operatingModel === 'HYBRID'
              ? 'Owned fleet size (trucks)'
              : 'Fleet size (trucks)'
          }
          required
          layout="chips"
          options={FLEET_SIZES.map((s) => ({ value: s, label: s }))}
          value={flow.fleetSize}
          onChange={flow.setFleetSize}
          error={flow.step3Attempted ? flow.step3Errors.fleetSize : null}
        />
      )}

      {(flow.operatingModel === 'NON_ASSET' || flow.operatingModel === 'HYBRID') && (
        <OperationalSelectorGroup<MonthlyVolume>
          label="Shipments arranged per month"
          required
          layout="chips"
          options={MONTHLY_VOLUMES.map((v) => ({ value: v.value, label: v.label }))}
          value={flow.monthlyVolume}
          onChange={flow.setMonthlyVolume}
          error={flow.step3Attempted ? flow.step3Errors.monthlyVolume : null}
        />
      )}

      <OperationalSelectorGroup<EmployeeCount>
        label="Team size"
        required
        layout="chips"
        options={EMPLOYEE_COUNTS.map((c) => ({ value: c, label: c }))}
        value={flow.employeeCount}
        onChange={flow.setEmployeeCount}
        error={flow.step3Attempted ? flow.step3Errors.employeeCount : null}
      />
    </>
  );

  return (
    <OnboardingFullPageFormStep
      title="Operational profile"
      subtitle={`How ${flow.orgName} runs on Pulse — fleet model, scale, and structure.`}
      eyebrow="Profile"
      primaryLabel="Continue"
      onPrimary={flow.continueCompanyDetails}
    >
      {fields}
    </OnboardingFullPageFormStep>
  );
}
