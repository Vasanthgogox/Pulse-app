import Theme from '@/constants/Theme';
import {
  InfoRow,
  SectionHeader,
  modelLabel,
  workspacePanelStyles as panelStyles,
} from '@/features/organization/components/workspace/workspacePanelUi';
import {
  KycOperatingAddressRow,
  KycRegistrationTypeRow,
  KycWebsiteRow,
} from '@/features/organization/components/workspace/kyc/KycBusinessDetailRows';
import type { OrgProfileFields } from '@/features/organization/services/organization.service';
import type { CurrentOrganization, RegistrationType, WorkspaceKyc } from '@/types/organization';
import { Lock } from 'lucide-react-native';
import { Text, View } from 'react-native';

type Props = {
  orgName: string;
  organization: CurrentOrganization | null;
  kyc: WorkspaceKyc | null;
  orgProfile: OrgProfileFields | null;
  ownerEmail: string | null;
  canEdit: boolean;
  frozen: boolean;
  onSaveRegistrationType: (
    type: RegistrationType,
  ) => Promise<{ error: Error | null }>;
  onSaveOperatingAddress: (input: {
    address_line: string;
    city: string;
    state: string;
    address_pincode: string;
  }) => Promise<{ error: Error | null }>;
  onSaveWebsite: (website: string) => Promise<{ error: Error | null }>;
};

export function OrganizationBusinessDetailsPanel({
  orgName,
  organization,
  kyc,
  orgProfile,
  ownerEmail,
  canEdit,
  frozen,
  onSaveRegistrationType,
  onSaveOperatingAddress,
  onSaveWebsite,
}: Props) {
  return (
    <View style={panelStyles.panelStack}>
      {!canEdit ? (
        <View style={panelStyles.kycReadonlyNote}>
          <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
          <Text style={panelStyles.kycReadonlyText}>
            Only admins and owners can edit business details.
          </Text>
        </View>
      ) : frozen ? (
        <View style={panelStyles.kycReadonlyNote}>
          <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
          <Text style={panelStyles.kycReadonlyText}>
            Identity fields stay locked while verification is in progress or approved.
          </Text>
        </View>
      ) : null}

      <View style={panelStyles.detailCard}>
        <SectionHeader label="Profile" />
        <InfoRow label="Business name" value={orgName || kyc?.name || '—'} />
        <KycRegistrationTypeRow
          kyc={kyc}
          canEdit={canEdit}
          frozen={frozen}
          onSave={onSaveRegistrationType}
        />
        {organization?.operatingModel ? (
          <InfoRow
            label="Operating model"
            value={modelLabel(organization.operatingModel)}
          />
        ) : null}
      </View>

      <View style={panelStyles.detailCard}>
        <SectionHeader label="Contact" />
        {ownerEmail ? <InfoRow label="Email" value={ownerEmail} /> : null}
        <KycWebsiteRow
          website={orgProfile?.profile_website ?? ''}
          canEdit={canEdit}
          frozen={frozen}
          onSave={onSaveWebsite}
        />
      </View>

      <View style={panelStyles.detailCard}>
        <SectionHeader label="Address" />
        <KycOperatingAddressRow
          kyc={kyc}
          canEdit={canEdit}
          frozen={frozen}
          onSave={onSaveOperatingAddress}
        />
      </View>
    </View>
  );
}
