/**
 * Edit workspace company profile sections (Highlights, Contact, About, Products).
 */
import Theme from "@/constants/Theme";
import type { OrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import { updateOrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import { useInvalidateOrganizationWorkspaceProfile } from "@/lib/queries/useOrganizationWorkspaceProfileQuery";
import { updateProfile } from "@/features/auth/services/auth.service";
import { Save, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type WorkspaceProfileEditSection =
  | "highlights"
  | "contact"
  | "about"
  | "products";

type Props = {
  visible: boolean;
  orgId: string;
  section: WorkspaceProfileEditSection;
  profile: OrganizationWorkspaceProfile;
  email: string;
  phone?: string | null;
  onClose: () => void;
};

const SECTION_TITLES: Record<WorkspaceProfileEditSection, string> = {
  highlights: "Edit highlights",
  contact: "Edit headquarter & contact",
  about: "Edit about",
  products: "Edit products",
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "url" | "email-address";
}) {
  return (
    <View style={modalStyles.field}>
      <Text style={modalStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={[modalStyles.input, multiline && modalStyles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function NetworkDesktopWorkspaceProfileModal({
  visible,
  orgId,
  section,
  profile,
  email,
  phone,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateOrganizationWorkspaceProfile();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [foundedYear, setFoundedYear] = useState("");
  const [area, setArea] = useState("");
  const [ceoName, setCeoName] = useState("");
  const [sector, setSector] = useState("");
  const [website, setWebsite] = useState("");
  const [facebook, setFacebook] = useState("");
  const [youtube, setYoutube] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [about, setAbout] = useState("");
  const [productsText, setProductsText] = useState("");

  const resetForm = useCallback(() => {
    setFoundedYear(profile.founded_year != null ? String(profile.founded_year) : "");
    setArea(profile.profile_area?.trim() ?? profile.zone?.trim() ?? "India");
    setCeoName(profile.profile_ceo_name?.trim() ?? email.split("@")[0] ?? "");
    setSector(profile.profile_sector?.trim() ?? "Logistics & transport");
    setWebsite(profile.profile_website?.trim() ?? "");
    setFacebook(profile.profile_facebook?.trim() ?? "");
    setYoutube(profile.profile_youtube?.trim() ?? "");
    setPhoneValue(phone?.trim() ?? "");
    setAddressLine(profile.address_line?.trim() ?? "");
    setCity(profile.city?.trim() ?? "");
    setState(profile.state?.trim() ?? "");
    setAbout(profile.profile_about?.trim() ?? "");
    setProductsText((profile.profile_products ?? []).join(", "));
    setError(null);
  }, [email, profile]);

  useEffect(() => {
    if (visible) resetForm();
  }, [visible, resetForm]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let payload: Parameters<typeof updateOrganizationWorkspaceProfile>[1] = {};

    if (section === "highlights") {
      const year = foundedYear.trim() ? parseInt(foundedYear.trim(), 10) : null;
      if (foundedYear.trim() && (year == null || Number.isNaN(year) || year < 1800 || year > 2100)) {
        setSaving(false);
        setError("Founded year must be a valid year.");
        return;
      }
      payload = {
        founded_year: year,
        profile_area: area,
        profile_ceo_name: ceoName,
        profile_sector: sector,
      };
    } else if (section === "contact") {
      payload = {
        profile_website: website,
        profile_facebook: facebook,
        profile_youtube: youtube,
        address_line: addressLine,
        city,
        state,
      };
      if (phoneValue.trim() !== (phone?.trim() ?? "")) {
        const { error: phoneErr } = await updateProfile({ phone: phoneValue.trim() });
        if (phoneErr) {
          setSaving(false);
          setError(phoneErr.message);
          return;
        }
      }
    } else if (section === "about") {
      payload = { profile_about: about };
    } else {
      payload = {
        profile_products: productsText
          .split(/[,;\n]/)
          .map((p) => p.trim())
          .filter(Boolean),
      };
    }

    const { error: err } = await updateOrganizationWorkspaceProfile(orgId, payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    invalidate(orgId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable
          style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{SECTION_TITLES[section]}</Text>
            <Pressable onPress={onClose} style={modalStyles.closeBtn} hitSlop={8}>
              <X size={18} color={Theme.textPrimaryDark} />
            </Pressable>
          </View>

          <ScrollView
            style={modalStyles.scroll}
            contentContainerStyle={modalStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {section === "highlights" ? (
              <>
                <Field label="Founded year" value={foundedYear} onChangeText={setFoundedYear} placeholder="e.g. 2024" keyboardType="numeric" />
                <Field label="Area" value={area} onChangeText={setArea} placeholder="e.g. India" />
                <Field label="CEO / owner" value={ceoName} onChangeText={setCeoName} placeholder="Display name" />
                <Field label="Sector" value={sector} onChangeText={setSector} placeholder="e.g. Logistics & transport" />
              </>
            ) : null}

            {section === "contact" ? (
              <>
                <Field label="Website" value={website} onChangeText={setWebsite} placeholder="https://company.com" keyboardType="url" />
                <Field label="Facebook" value={facebook} onChangeText={setFacebook} placeholder="@company" />
                <Field label="YouTube" value={youtube} onChangeText={setYoutube} placeholder="@company" />
                <Field label="Address line" value={addressLine} onChangeText={setAddressLine} placeholder="Street / plot" />
                <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
                <Field label="State" value={state} onChangeText={setState} placeholder="State" />
                <Field label="Phone" value={phoneValue} onChangeText={setPhoneValue} placeholder="+91 98765 43210" keyboardType="numeric" />
                <Text style={modalStyles.readOnlyHint}>
                  Email {email || "—"} is managed in account settings.
                </Text>
              </>
            ) : null}

            {section === "about" ? (
              <Field
                label="About"
                value={about}
                onChangeText={setAbout}
                placeholder="Describe your company and how you use Pulse…"
                multiline
              />
            ) : null}

            {section === "products" ? (
              <>
                <Field
                  label="Products (comma-separated)"
                  value={productsText}
                  onChangeText={setProductsText}
                  placeholder="Trip management, Load posting, Ledger sync"
                  multiline
                />
                <Text style={modalStyles.readOnlyHint}>
                  Tags appear on your public workspace profile.
                </Text>
              </>
            ) : null}

            {error ? <Text style={modalStyles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={modalStyles.footer}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.saveBtn, saving && modalStyles.saveBtnDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <>
                  <Save size={14} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
                  <Text style={modalStyles.saveText}>Save</Text>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(24, 28, 50, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "88%",
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 40px rgba(24, 28, 50, 0.18)" } as ViewStyle,
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  title: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  scroll: { maxHeight: 420 },
  scrollContent: { padding: 20, gap: 14 },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    minHeight: 42,
  },
  inputMulti: { minHeight: 100, textAlignVertical: "top" },
  readOnlyHint: { fontSize: 12, color: Theme.textMuted, lineHeight: 18 },
  error: { fontSize: 13, color: Theme.destructive, fontWeight: "500" },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 13, fontWeight: "600", color: Theme.textSecondary },
  saveBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { fontSize: 13, fontWeight: "700", color: Theme.buttonPrimaryText },
});
