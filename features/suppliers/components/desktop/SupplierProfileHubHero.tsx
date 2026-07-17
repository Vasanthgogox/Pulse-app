/**
 * Supplier Profile Hero — Metronic hex-pattern layout, mirrors ClientProfileHubHero.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  ProfileHubLottieIcon,
  type ProfileHubLottieKey,
} from "@/features/party/components/ProfileHubAnimatedIcons";
import {
  METRONIC,
  hubStyles as styles,
  spStyles as _spStyles,
  supplierStyles,
} from "@/features/suppliers/components/desktop/supplierProfileHub.styles";

const spStyles = { ..._spStyles, ...supplierStyles };
import { ArrowLeft, BadgeCheck, Mail, MapPin, Phone, ShieldCheck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  supplier: SupplierRow;
  totalTrips: number;
  totalPayable: number;
  kycScore: number;
  performanceScore: number;
  onBack?: () => void;
};

function StatusPill({ label, tone }: { label: string; tone?: "green" | "muted" | "warn" | "blue" | "red" }) {
  const bg =
    tone === "green" ? "#E8FFF3" :
    tone === "warn"  ? "#FFF8DD" :
    tone === "blue"  ? "#EEF6FF" :
    tone === "red"   ? "#FFF1F2" :
                       "#F1F1F4";
  const text =
    tone === "green" ? "#50CD89" :
    tone === "warn"  ? "#F6C000" :
    tone === "blue"  ? "#3E97FF" :
    tone === "red"   ? "#F1416C" :
                       METRONIC.subtle;
  return (
    <View style={[styles.subscribedPill, { backgroundColor: bg }]}>
      <Text style={[styles.subscribedPillText, { color: text }]}>{label}</Text>
    </View>
  );
}

function inr(n: number): string {
  if (n === 0) return "₹0";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function SupplierProfileHubHero({
  supplier,
  totalTrips,
  totalPayable,
  kycScore,
  performanceScore,
  onBack,
}: Props) {
  const displayName = (supplier.name || supplier.company_name || supplier.contact_person || "Supplier")
    .trim()
    .toUpperCase();
  const contactPerson = supplier.contact_person?.trim();
  const isIntegrated = supplier.supplier_type === "integrated";
  const isVerified = supplier.is_verified;
  const gstin = supplier.gstin?.trim();
  const phone = supplier.phone?.trim();
  const email = supplier.email?.trim();
  const address = supplier.address?.trim();

  const grade =
    performanceScore >= 90 ? "A+"
    : performanceScore >= 80 ? "A"
    : performanceScore >= 65 ? "B"
    : performanceScore >= 50 ? "C"
    : "D";

  return (
    <View style={styles.hero}>
      <View style={styles.heroHexOverlay} />
      {onBack ? (
        <Pressable
          style={spStyles.heroBackCorner}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={16} color={METRONIC.text} strokeWidth={2.2} />
          <Text style={spStyles.heroBackText}>Back</Text>
        </Pressable>
      ) : null}

      <View style={styles.heroInner}>
        <View style={[styles.heroCenter, spStyles.heroCompactCenter]}>
          {/* Avatar */}
          <View style={styles.heroAvatarRing}>
            <PartyAvatar
              entityType="supplier"
              name={displayName}
              avatarUrl={supplier.avatar_url}
              avatarSeed={supplier.avatar_seed}
              size={88}
            />
            {isVerified ? (
              <View style={spStyles.heroVerifiedBadge}>
                <BadgeCheck size={16} color={Theme.cardWhite} strokeWidth={2.2} />
              </View>
            ) : null}
          </View>

          {/* Name */}
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{displayName}</Text>
            {isVerified ? (
              <BadgeCheck size={20} color={METRONIC.link} strokeWidth={2.2} />
            ) : null}
          </View>

          {/* Meta row: address, email */}
          <View style={styles.heroMetaRow}>
            {address ? (
              <View style={styles.heroMetaItem}>
                <MapPin size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText} numberOfLines={1}>{address}</Text>
              </View>
            ) : null}
            {email ? (
              <View style={styles.heroMetaItem}>
                <Mail size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText} numberOfLines={1}>{email}</Text>
              </View>
            ) : null}
            {phone ? (
              <View style={styles.heroMetaItem}>
                <Phone size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>{phone}</Text>
              </View>
            ) : null}
          </View>

          {contactPerson ? (
            <Text style={spStyles.heroSubline}>{contactPerson}</Text>
          ) : null}

          {/* Status pills */}
          <View style={spStyles.heroTagRow}>
            <StatusPill label="SUPPLIER" />
            <StatusPill
              label={isIntegrated ? "INTEGRATED" : "OFFLINE"}
              tone={isIntegrated ? "green" : "muted"}
            />
            <StatusPill
              label={isVerified ? "VERIFIED" : "UNVERIFIED"}
              tone={isVerified ? "green" : "warn"}
            />
            <StatusPill
              label={`KYC ${kycScore}%`}
              tone={kycScore >= 80 ? "green" : kycScore >= 50 ? "warn" : "red"}
            />
            <StatusPill
              label={`GRADE ${grade}`}
              tone={grade === "A+" || grade === "A" ? "green" : grade === "B" ? "blue" : "warn"}
            />
          </View>

          {/* GSTIN */}
          {gstin ? (
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaItem}>
                <ShieldCheck size={13} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={styles.heroMetaText}>GSTIN {gstin}</Text>
              </View>
            </View>
          ) : null}

          {/* Quick stats */}
          <View style={spStyles.heroStatsRow}>
            {(
              [
                { value: String(totalTrips), label: "TRIPS", lottie: "truck" as ProfileHubLottieKey },
                { value: inr(totalPayable), label: "PAYABLE", lottie: "payment" as ProfileHubLottieKey },
                { value: String(performanceScore), label: "SCORE", lottie: "signals" as ProfileHubLottieKey },
              ] as const
            ).map((stat, idx, arr) => (
              <View key={stat.label} style={{ flex: 1, flexDirection: "row", alignItems: "stretch" }}>
                {idx > 0 ? <View style={spStyles.heroStatDivider} /> : null}
                <View style={[spStyles.heroStatItem, { flex: 1 }]}>
                  <ProfileHubLottieIcon name={stat.lottie} size={20} glyphScale={1.15} />
                  <Text
                    style={[
                      spStyles.heroStatValue,
                      stat.label === "PAYABLE" && totalPayable > 0 && { color: "#F6C000" },
                    ]}
                  >
                    {stat.value}
                  </Text>
                  <Text style={spStyles.heroStatLabel}>{stat.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
