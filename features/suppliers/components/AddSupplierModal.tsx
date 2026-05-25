/**
 * Add Supplier modal — mobile quick-add: name, company name, phone.
 * When visible is true, presents as bottom-sheet popup (same style as Add Client); when visible is undefined, full-screen (e.g. route).
 * When searchInviteeByPhone and onSendInvitation are provided, phone is auto-fetched (debounced)
 * like Add Client: match auto-fills name/phone and shows "Found on platform".
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickContactForNameAndPhone } from "@/lib/contactPicker";
import { validatePhone } from "@/lib/phoneValidation";
import { formatMobileNumber } from "@/lib/format";
import {
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
} from "@/features/connections/services/connectionRequests.service";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { partyAddModalChromeStyles } from "@/components/PartyAddModalChrome";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface SupplierFormData {
  name: string;
  companyName: string;
  phone: string;
}

export interface SupplierInviteeMatch {
  organization_id: string;
  full_name: string;
  phone: string;
  organization_name?: string;
  profile_company_name?: string | null;
  /** From `get_invitee_by_phone` (profiles.role, lowercase). */
  profile_role?: string;
}

interface AddSupplierModalProps {
  onClose: () => void;
  onComplete: (data: SupplierFormData) => void | Promise<unknown>;
  /** When true, show as bottom-sheet popup (like Add Client). When undefined, full-screen (e.g. add-supplier route). */
  visible?: boolean;
  /** When set, shown at top of form and submit is disabled (e.g. no organization loaded). */
  noOrganizationMessage?: string | null;
  /** Called when user taps Refresh to retry loading organization. */
  onRefreshOrganization?: () => void;
  /** When provided, enables "Search by phone" to find an existing org and send connection invite. */
  searchInviteeByPhone?: (
    phone: string,
  ) => Promise<SupplierInviteeMatch | null>;
  /** When provided and search found someone, "Send invitation" calls this with their org id. */
  onSendInvitation?: (toOrgId: string) => Promise<void>;
}

const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const PHONE_DEBOUNCE_MS = 400;

export function AddSupplierModal({
  onClose,
  onComplete,
  visible,
  noOrganizationMessage,
  onRefreshOrganization,
  searchInviteeByPhone,
  onSendInvitation,
}: AddSupplierModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteeMatch, setInviteeMatch] = useState<SupplierInviteeMatch | null>(
    null,
  );
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [searchedNoResult, setSearchedNoResult] = useState(false);
  const [driverRegisteredAtPhone, setDriverRegisteredAtPhone] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const searchIdRef = useRef(0);
  const companyInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const { width: windowWidth } = useWindowDimensions();
  const inviteeIsDriver = inviteeProfileIsDriver(inviteeMatch?.profile_role);

  const handleImportFromContacts = async () => {
    setError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setName(result.contact.name);
        setPhone(result.contact.phone);
        setInviteeMatch(null);
        setSearchedNoResult(false);
        setDriverRegisteredAtPhone(false);
      } else if (
        result.reason === "no_phone" ||
        result.reason === "permission_denied" ||
        result.reason === "unavailable"
      ) {
        setError(
          result.message ??
            (result.reason === "permission_denied"
              ? t("contactAccessDenied")
              : t("couldNotLoadContact")),
        );
      }
    } finally {
      setImportLoading(false);
    }
  };

  const blockedByNoOrg = noOrganizationMessage != null;
  const phoneError = phone.trim() ? validatePhone(phone.trim()) : null;
  const canSubmit =
    !blockedByNoOrg &&
    !driverRegisteredAtPhone &&
    companyName.trim().length > 0 &&
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    !phoneError &&
    !submitting;
  const hasInviteSearch = Boolean(searchInviteeByPhone && onSendInvitation);
  const useInvitePrimaryAction = Boolean(
    inviteeMatch && onSendInvitation,
  );
  const hidePrimaryActionForDriverMatch = Boolean(inviteeMatch && inviteeIsDriver);

  // Reset form when modal opens so each open shows empty fields (not previous submission).
  useEffect(() => {
    if (visible === true) {
      setName("");
      setCompanyName("");
      setPhone("");
      setError(null);
      setSubmitting(false);
      setInviteeMatch(null);
      setPhoneSearchLoading(false);
      setSearchedNoResult(false);
      setDriverRegisteredAtPhone(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!searchInviteeByPhone || !onSendInvitation) return;
    const normalized = phone.trim().replace(/\s+/g, "");
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++searchIdRef.current;
    setPhoneSearchLoading(true);
    const t = setTimeout(() => {
      searchInviteeByPhone(normalized).then((result) => {
        if (searchIdRef.current !== id) return;
        setPhoneSearchLoading(false);
        setInviteeMatch(result ?? null);
        setSearchedNoResult(!result);
        setDriverRegisteredAtPhone(
          Boolean(result && inviteeProfileIsDriver(result.profile_role)),
        );
        if (result) {
          setName((prev) => (prev.trim() ? prev : result.full_name));
          const suggested = inviteeSuggestedCompanyName(result);
          if (suggested) {
            setCompanyName((prev) => (prev.trim() ? prev : suggested));
          }
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [phone, searchInviteeByPhone, onSendInvitation]);

  /** Clearing/editing phone after a lookup match should drop auto-filled name + company (same as invalidating the search). */
  const handlePhoneChangeText = (text: string) => {
    const hadInviteeMatch = inviteeMatch != null;
    setPhone(formatMobileNumber(text));
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (hadInviteeMatch) {
      setName("");
      setCompanyName("");
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteeMatch || !onSendInvitation) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSendInvitation(inviteeMatch.organization_id);
      setSubmitting(false);
      onClose();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
    }
  };

  const handleAddAsOfflineInstead = () => {
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setError(null);
    setDriverRegisteredAtPhone(false);
  };

  const handleCreateSuccessOk = () => {
    setShowCreateSuccess(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (driverRegisteredAtPhone) {
      setError(t("errorDriverCannotAddAsSupplier"));
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = onComplete({
      name: name.trim(),
      companyName: companyName.trim(),
      phone: phone.trim(),
    });
    const p = result as void | Promise<unknown>;
    if (typeof p?.then === "function") {
      p.then(() => {
        setSubmitting(false);
        setShowCreateSuccess(true);
      }).catch((err: Error) => {
        setSubmitting(false);
        setError(err?.message ?? "Failed to add supplier");
      });
    } else {
      setSubmitting(false);
      setShowCreateSuccess(true);
    }
  };

  const inputStyle = [
    styles.input,
    {
      borderColor: Theme.borderInput,
      backgroundColor: Theme.surfaceForm,
      color: Theme.textPrimary,
    },
  ];
  const labelStyle = [styles.label, { color: Theme.textMutedDemo }];
  const isPopup = visible === true;
  const useSingleColumnFields = windowWidth < 390;

  const ledgerFormContent = (
    <>
      <View style={styles.ledgerHeaderRow}>
        <Text style={styles.ledgerTitle}>ADD SUPPLIER</Text>
        <TouchableOpacity
          style={styles.ledgerCloseBtn}
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <FontAwesome name="times" size={10} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
      </View>
      {noOrganizationMessage ? (
        <View style={styles.ledgerNoOrgBanner}>
          <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
            {noOrganizationMessage}
          </Text>
          {onRefreshOrganization ? (
            <TouchableOpacity
              style={styles.ledgerRefreshBtn}
              onPress={() => onRefreshOrganization()}
            >
              <Text style={styles.ledgerRefreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <Pressable
        style={styles.ledgerAmountBlock}
        onPress={() => phoneInputRef.current?.focus()}
      >
        <Text style={styles.ledgerAmountLabel}>PHONE</Text>
        <View style={styles.ledgerAmountRow}>
          <TextInput
            ref={phoneInputRef}
            style={styles.ledgerAmountInput}
            placeholder="+91 …"
            placeholderTextColor={Theme.textMutedDemo}
            value={phone}
            onChangeText={handlePhoneChangeText}
            keyboardType="phone-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
      </Pressable>
      <View style={styles.ledgerTwoCol}>
        <Pressable
          style={[styles.ledgerFieldBlock, styles.ledgerFieldBlockCol]}
          onPress={() => nameInputRef.current?.focus()}
        >
          <Text style={styles.ledgerFieldLabelCol}>NAME</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.ledgerFieldInput}
            placeholder={t("contactName")}
            placeholderTextColor={Theme.textMutedDemo}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </Pressable>
        <Pressable
          style={[styles.ledgerFieldBlock, styles.ledgerFieldBlockCol]}
          onPress={() => companyInputRef.current?.focus()}
        >
        <Text style={styles.ledgerFieldLabelCol}>COMPANY NAME *</Text>
          <TextInput
            ref={companyInputRef}
            style={styles.ledgerFieldInput}
            placeholder={t("company")}
            placeholderTextColor={Theme.textMutedDemo}
            value={companyName}
            onChangeText={setCompanyName}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </Pressable>
      </View>
      {phoneError && (
        <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
          {phoneError}
        </Text>
      )}
      <TouchableOpacity
        style={styles.importFromContactsRow}
        onPress={handleImportFromContacts}
        disabled={importLoading}
        activeOpacity={0.7}
      >
        {importLoading ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <FontAwesome name="address-book-o" size={14} color={Theme.primary} />
        )}
        <Text style={[styles.importFromContactsText, { color: Theme.primary }]}>
          {importLoading ? t("linking") : t("importFromContacts")}
        </Text>
      </TouchableOpacity>
      {hasInviteSearch && phone.trim().length > 0 ? (
        <Text style={styles.ledgerPhoneHint}>
          Search by number to find someone on the platform and invite their
          organization.
        </Text>
      ) : null}
      {hasInviteSearch &&
      phone.trim().replace(/\s+/g, "").length >= MIN_PHONE_LENGTH_FOR_SEARCH &&
      phoneSearchLoading ? (
        <View style={styles.ledgerAutoFetchRow}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={styles.ledgerAutoFetchText}>Looking up…</Text>
        </View>
      ) : null}
      {inviteeMatch ? (
        <View style={styles.ledgerInviteeCard}>
          <Text style={styles.ledgerInviteeLabel}>
            {inviteeIsDriver
              ? t("inviteeRegisteredDriver")
              : t("inviteeFoundOnPlatform")}
          </Text>
          <Text style={styles.ledgerInviteeName}>
            {inviteeMatch.full_name || inviteeMatch.phone}
          </Text>
          <Text style={styles.ledgerInviteeFooterHint}>
            {inviteeIsDriver
              ? t("addSupplierInviteeHintDriver")
              : t("addSupplierInviteeHintDefault")}
          </Text>
          {!inviteeIsDriver ? (
            <TouchableOpacity
              style={styles.ledgerAddOfflineLink}
              onPress={handleAddAsOfflineInstead}
              disabled={submitting}
            >
              <Text style={styles.ledgerAddOfflineLinkText}>
                Add as offline instead
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : searchedNoResult ? (
        <Text style={[styles.ledgerHintText, { color: Theme.textSecondary }]}>
          No account with this number. Add as offline below.
        </Text>
      ) : null}
      {error ? (
        <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
          {error}
        </Text>
      ) : null}
      {!hidePrimaryActionForDriverMatch ? (
        <TouchableOpacity
          style={[
            styles.ledgerSubmitBtn,
            !canSubmit && styles.ledgerSubmitBtnDisabled,
          ]}
          onPress={useInvitePrimaryAction ? handleSendInvitation : handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.9}
        >
          <Text style={styles.ledgerSubmitBtnText}>
            {submitting
              ? useInvitePrimaryAction
                ? t("sending")
                : "Adding…"
              : useInvitePrimaryAction
                ? t("sendInvitation")
                : "ADD SUPPLIER"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (visible === false) return null;

  if (visible === true) {
    const windowHeight = Dimensions.get("window").height;
    const windowWidth = Dimensions.get("window").width;
    const shellMaxH = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight,
      windowHeight * 0.92,
    );
    const shellMaxW = Math.min(540, Math.max(280, windowWidth - 36));
    return (
      <>
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={onClose}
          presentationStyle="overFullScreen"
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            keyboardVerticalOffset={insets.top + 16}
          >
            <View style={partyAddModalChromeStyles.overlay}>
              <Pressable
                style={partyAddModalChromeStyles.overlayDismissHit}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              />
              <View
                style={[
                  partyAddModalChromeStyles.shell,
                  { maxWidth: shellMaxW, maxHeight: shellMaxH },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: shellMaxH }}
                  contentContainerStyle={[
                    styles.ledgerPanelScrollContent,
                    {
                      paddingHorizontal: 24,
                      paddingTop: 24,
                      paddingBottom: insets.bottom + Layout.modalBottomPadding,
                    },
                  ]}
                >
                  {ledgerFormContent}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <ThemedAlertModal
          visible={showCreateSuccess}
          title="Supplier added successfully"
          message=""
          okText="OK"
          onOk={handleCreateSuccessOk}
          onRequestClose={handleCreateSuccessOk}
          variant="neutral"
          okVariant="primary"
        />
      </>
    );
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.screenRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screenRoot, { backgroundColor: Theme.surface }]}>
        <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.screenHeaderButton}
            onPress={onClose}
            accessibilityLabel="Go back"
            activeOpacity={0.8}
          >
            <FontAwesome
              name="chevron-left"
              size={16}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <View style={styles.screenHeaderTitleWrap}>
            <Text style={styles.screenTitle}>Add Supplier</Text>
          </View>
        </View>
        <ScrollView
          style={styles.screenScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.screenScrollContent,
            { paddingBottom: insets.bottom + 140 },
          ]}
        >
          <View style={styles.screenSection}>
            <Text style={styles.screenSectionLabel}>SUPPLIER DETAILS</Text>

            {noOrganizationMessage ? (
              <View style={styles.screenStatusCard}>
                <Text style={[styles.screenStatusText, { color: Theme.negative }]}>
                  {noOrganizationMessage}
                </Text>
                {onRefreshOrganization ? (
                  <TouchableOpacity
                    style={styles.screenRefreshButton}
                    onPress={() => onRefreshOrganization()}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.screenRefreshButtonText}>Refresh</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <Pressable
              onPress={() => phoneInputRef.current?.focus()}
              style={styles.screenInputCard}
            >
              <Text style={styles.screenInputLabel}>
                Phone number <Text style={styles.screenRequiredMark}>*</Text>
              </Text>
              <TextInput
                ref={phoneInputRef}
                style={styles.screenInput}
                placeholder="+91 98765 43210"
                placeholderTextColor={Theme.textMutedDemo}
                value={phone}
                onChangeText={handlePhoneChangeText}
                keyboardType="phone-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
            </Pressable>

            <View
              style={[
                styles.screenTwoCol,
                useSingleColumnFields && styles.screenTwoColStack,
              ]}
            >
              <Pressable
                onPress={() => nameInputRef.current?.focus()}
                style={styles.screenFieldCard}
              >
                <Text style={styles.screenInputLabel}>
                  Name <Text style={styles.screenRequiredMark}>*</Text>
                </Text>
                <TextInput
                  ref={nameInputRef}
                  style={styles.screenInput}
                  placeholder={t("contactName")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Pressable>

              <Pressable
                onPress={() => companyInputRef.current?.focus()}
                style={styles.screenFieldCard}
              >
                <Text style={styles.screenInputLabel}>
                  {t("companyName")}{" "}
                  <Text style={styles.screenRequiredMark}>*</Text>
                </Text>
                <TextInput
                  ref={companyInputRef}
                  style={styles.screenInput}
                  placeholder={t("company")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={companyName}
                  onChangeText={setCompanyName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Pressable>
            </View>

            {phoneError && (
              <View style={styles.screenErrorCard}>
                <Text style={styles.screenErrorText}>{phoneError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.screenActionCard}
              onPress={handleImportFromContacts}
              disabled={importLoading}
              activeOpacity={0.8}
            >
              <View style={styles.screenActionIconWrap}>
                {importLoading ? (
                  <ActivityIndicator size="small" color={Theme.buttonMatteBlackText} />
                ) : (
                  <FontAwesome
                    name="address-book-o"
                    size={16}
                    color={Theme.buttonMatteBlackText}
                  />
                )}
              </View>
              <View style={styles.screenActionTextWrap}>
                <Text style={styles.screenActionTitle}>
                  {importLoading ? "Opening contacts..." : t("importFromContacts")}
                </Text>
                <Text style={styles.screenActionSubtitle}>
                  Fill supplier contact name and phone from your address book.
                </Text>
              </View>
            </TouchableOpacity>

            {hasInviteSearch && phone.trim().length > 0 ? (
              <Text style={styles.screenHintText}>
                Search by this number to find a person on the platform and invite
                their organization.
              </Text>
            ) : null}

            {hasInviteSearch &&
            phone.trim().replace(/\s+/g, "").length >=
              MIN_PHONE_LENGTH_FOR_SEARCH &&
            phoneSearchLoading ? (
              <View style={styles.screenLookupCard}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.screenLookupText}>Looking up...</Text>
              </View>
            ) : null}

            {inviteeMatch ? (
              <View style={styles.screenInviteeCard}>
                <Text style={styles.screenInviteeLabel}>
                  {inviteeIsDriver
                    ? t("inviteeRegisteredDriver").toUpperCase()
                    : t("inviteeFoundOnPlatform").toUpperCase()}
                </Text>
                <Text style={styles.screenInviteeName}>
                  {inviteeMatch.full_name || inviteeMatch.phone}
                </Text>
                <Text style={styles.screenInviteeSubtext}>
                  {inviteeIsDriver
                    ? t("addSupplierInviteeHintDriver")
                    : t("addSupplierInviteeHintDefault")}
                </Text>
                {!inviteeIsDriver ? (
                  <TouchableOpacity
                    style={styles.screenAddOfflineLink}
                    onPress={handleAddAsOfflineInstead}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.screenAddOfflineLinkText}>
                      Add as offline instead
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : searchedNoResult ? (
              <View style={styles.screenStatusCard}>
                <Text style={styles.screenStatusText}>
                  No account with this number. You can add this supplier as offline.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.screenErrorCard}>
                <Text style={styles.screenErrorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View
          style={[
            styles.screenFooter,
            { paddingBottom: insets.bottom + 12 },
          ]}
        >
          {!hidePrimaryActionForDriverMatch ? (
            <TouchableOpacity
              style={[
                styles.screenSubmitButton,
                (!canSubmit || submitting) && styles.screenButtonDisabled,
              ]}
              onPress={
                useInvitePrimaryAction ? handleSendInvitation : handleSubmit
              }
              disabled={!canSubmit || submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.screenSubmitButtonText}>
                {submitting
                  ? useInvitePrimaryAction
                    ? t("sending")
                    : "Saving..."
                  : useInvitePrimaryAction
                    ? t("sendInvitation")
                    : "ADD SUPPLIER"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    <ThemedAlertModal
      visible={showCreateSuccess}
      title="Supplier added successfully"
      message=""
      okText="OK"
      onOk={handleCreateSuccessOk}
      onRequestClose={handleCreateSuccessOk}
      variant="neutral"
      okVariant="primary"
    />
    </>
  );
}

const styles = StyleSheet.create({
  ledgerPanelScrollContent: {
    gap: 24,
    paddingBottom: 8,
  },
  ledgerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ledgerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  ledgerCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerAmountBlock: {
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 16,
  },
  ledgerAmountLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  ledgerAmountRow: { flexDirection: "row", alignItems: "center" },
  ledgerAmountInput: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  fieldRowWrap: {
    marginBottom: 20,
  },
  ledgerFieldBlock: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  ledgerTwoCol: { flexDirection: "row", gap: 16 },
  ledgerFieldBlockCol: { flex: 1, minWidth: 0 },
  ledgerFieldLabelCol: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginRight: 8,
  },
  ledgerFieldInput: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  ledgerSubmitBtn: {
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: Theme.buttonPrimary,
  },
  ledgerSubmitBtnDisabled: { opacity: 0.5 },
  ledgerSubmitBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  ledgerNoOrgBanner: {
    padding: 12,
    borderRadius: 4,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.negative + "40",
  },
  ledgerErrorText: { fontSize: 10, marginTop: 4 },
  ledgerRefreshBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: Theme.primary,
    alignSelf: "flex-start",
  },
  ledgerRefreshBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  importFromContactsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
  },
  importFromContactsText: {
    fontSize: 13,
  },
  ledgerPhoneHint: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: -4,
    marginBottom: 4,
  },
  ledgerAutoFetchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  ledgerAutoFetchText: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  ledgerInviteeCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    backgroundColor: Theme.surfaceLight,
  },
  ledgerInviteeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ledgerInviteeName: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  ledgerInviteeFooterHint: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginBottom: 8,
    lineHeight: 13,
  },
  ledgerAddOfflineLink: {
    paddingVertical: 6,
    alignItems: "center",
  },
  ledgerAddOfflineLinkText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  ledgerHintText: { fontSize: 10, marginBottom: 8 },
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: { flex: 1 },
  noOrgBanner: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 4,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.negative + "40",
  },
  refreshBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  refreshBtnText: { fontSize: 12, fontWeight: "600" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 44,
  },
  footer: { paddingTop: 16 },
  submitBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  errorText: { fontSize: 12, marginTop: 8, marginBottom: 8 },
  autoFetchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  autoFetchText: { fontSize: 12, color: Theme.textSecondary },
  inviteeCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
    backgroundColor: Theme.surfaceLight,
  },
  inviteeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inviteeName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  inviteeActions: { gap: 8 },
  inviteBtn: { marginBottom: 0 },
  addOfflineLink: { paddingVertical: 8, alignItems: "center" },
  addOfflineLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  hintText: { fontSize: 11, marginBottom: 12 },
  phoneLookupHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: -8,
    marginBottom: 8,
  },
  submitBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  screenRoot: {
    flex: 1,
  },
  screenScroll: {
    flex: 1,
  },
  screenScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    gap: 18,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  screenHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  screenSection: {
    gap: 14,
  },
  screenSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  screenInputCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenTwoCol: {
    flexDirection: "row",
    gap: 12,
  },
  screenTwoColStack: {
    flexDirection: "column",
  },
  screenFieldCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenInputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  screenRequiredMark: {
    color: Theme.negative,
  },
  screenInput: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    minHeight: 28,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  screenActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
  },
  screenActionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  screenActionSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  screenHintText: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginTop: -2,
  },
  screenLookupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  screenLookupText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  screenInviteeCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenInviteeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenInviteeName: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  screenInviteeSubtext: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  screenAddOfflineLink: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  screenAddOfflineLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    textDecorationLine: "underline",
  },
  screenStatusCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  screenStatusText: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 19,
  },
  screenRefreshButton: {
    alignSelf: "flex-start",
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  screenRefreshButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenErrorCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.negative + "30",
    borderRadius: 16,
    padding: 16,
  },
  screenErrorText: {
    fontSize: 13,
    color: Theme.negative,
    lineHeight: 19,
  },
  screenFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  screenSubmitButton: {
    minHeight: Layout.minTouchTargetSize + 12,
    borderRadius: 16,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  screenSubmitButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  screenButtonDisabled: {
    opacity: 0.5,
  },
});
