/**
 * Overview tab — company info, addresses, business metrics.
 */
import type { ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import { formatClientPhoneDisplay } from "@/features/clients/utils/clientManagement.util";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import { hubStyles as styles, METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { Globe, Mail, MapPin, Phone } from "lucide-react-native";
import { Text, View } from "react-native";

type Props = { bundle: ClientManagementBundle };

function HighlightRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function LinkRow({ icon: Icon, value }: { icon: typeof Globe; value: string }) {
  return (
    <View style={styles.networkLinkRow}>
      <Icon size={14} color={METRONIC.subtle} strokeWidth={2} />
      <Text style={styles.networkLinkText} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export function ClientProfileOverviewPanel({ bundle }: Props) {
  const c = bundle.client ?? {};
  const tradeName = String(c.trade_name ?? c.name ?? "Client");
  const registered = String(c.registered_address ?? c.address ?? "—");
  const billing = String(c.billing_address ?? "—");
  const corporate = String(c.corporate_address ?? c.hq_address ?? "—");
  const mapAddress = registered !== "—" ? registered : corporate !== "—" ? corporate : tradeName;

  return (
    <View style={styles.detailsBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highlights</Text>
            <HighlightRow label="Legal name" value={String(c.legal_name ?? c.name ?? "—")} />
            <HighlightRow label="Trade name" value={tradeName} />
            <HighlightRow label="GST" value={String(c.gstin ?? "—")} />
            <HighlightRow label="PAN" value={String(c.pan_number ?? "—")} />
            <HighlightRow label="CIN" value={String(c.cin ?? "—")} />
            <HighlightRow label="MSME" value={String(c.msme_number ?? "—")} />
            <HighlightRow label="Industry" value={String(c.industry ?? "—")} />
            <HighlightRow label="Status" value={String(c.client_status ?? c.status ?? "—").toUpperCase()} last />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Addresses</Text>
            <HighlightRow label="Registered" value={registered} />
            <HighlightRow label="Billing" value={billing} />
            <HighlightRow label="Corporate" value={corporate} last />
          </View>
        </View>

        <View style={styles.mainCol}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Company profile</Text>
            <Text style={styles.sectionHeading}>Headquarter</Text>
            <View style={styles.headquarterRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <NetworkDesktopHeadquarterMap
                  orgName={tradeName}
                  addressLabel={mapAddress}
                  coordinate={null}
                />
              </View>
              <View style={styles.contactList}>
                <LinkRow icon={Globe} value={String(c.website ?? "—")} />
                <LinkRow icon={Mail} value={String(c.email ?? "—")} />
                <LinkRow icon={Phone} value={formatClientPhoneDisplay(String(c.phone ?? ""))} />
                <LinkRow icon={MapPin} value={mapAddress} />
              </View>
            </View>
            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>About</Text>
            <Text style={styles.aboutBody}>
              {String(c.notes ?? "").trim() ||
                `${tradeName} is onboarded on Pulse for road transportation — trips, indents, billing, warehouse contracts, and KYC compliance.`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
