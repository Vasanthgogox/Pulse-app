/**
 * Add Driver modal — fields match Q-unified-base AddDriverWizard 100%.
 * Steps: Driver Info (driver source, phone*, name), Contact (email, emergency), Documents (license), Review.
 * Driver Source: Organization Driver | Partner Driver (clean, scalable terminology).
 * When visible is true, shows as Ledger-style bottom-sheet popup; when undefined, full-screen wizard (e.g. route).
 */
import { WizardStepLayout } from '@/components/WizardStepLayout';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { pickContactForNameAndPhone } from '@/lib/contactPicker';
import { validatePhone } from '@/lib/phoneValidation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExistingDriverMatch } from '../services/drivers.service';
import { searchExistingDriversByPhone } from '../services/drivers.service';

export type DriverSource = 'organization' | 'partner';

export interface DriverFormData {
  driverSource: DriverSource;
  name: string;
  phone: string;
  email: string;
  emergencyContact: string;
  emergencyName: string;
  licenseNumber: string;
  /** Optional offer: fixed salary (e.g. monthly ₹). */
  payableAmount: number | null;
  /** Optional offer: commission %. */
  commissionPercent: number | null;
  /** Optional offer: per-km rate (₹/km). */
  commissionPerKm: number | null;
}

const STEPS_FULL_KEYS = [
  { id: 'driver', titleKey: 'driverInfo', descriptionKey: 'basicDetails' },
  { id: 'contact', titleKey: 'contactStep', descriptionKey: 'phoneAndEmail' },
  { id: 'documents', titleKey: 'documents', descriptionKey: 'licenseInfo' },
  { id: 'salary', titleKey: 'salaryStep', descriptionKey: 'compensationOptional' },
  { id: 'review', titleKey: 'review', descriptionKey: 'sendInvite' },
];

const STEPS_SALARIED_ONLY_KEYS = [
  { id: 'driver', titleKey: 'driverStep', descriptionKey: 'dlNamePhone' },
  { id: 'salary', titleKey: 'salarySplit', descriptionKey: 'fixedSalaryCommission' },
  { id: 'review', titleKey: 'review', descriptionKey: 'sendInvitation' },
];

const defaultFormData: DriverFormData = {
  driverSource: 'organization',
  name: '',
  phone: '',
  email: '',
  emergencyContact: '',
  emergencyName: '',
  licenseNumber: '',
  payableAmount: null,
  commissionPercent: null,
  commissionPerKm: null,
};

interface AddDriverModalProps {
  onClose: () => void;
  /** Called when "Send Invitation" is tapped. May return a Promise; modal closes after it resolves. */
  onComplete: (data: DriverFormData) => void | Promise<void>;
  /** Optional. When provided, "Add Driver" is shown on review step; called when tapped (add driver directly, no invite). */
  onAddDriver?: (data: DriverFormData) => void;
  /** When true, show as Ledger-style bottom-sheet popup. When undefined, full-screen (e.g. add-driver route). */
  visible?: boolean;
  /** When true (e.g. from Finance Drivers tab), only add salaried driver: step 1 = DL, name, phone; step 2 = salary split (fixed, commission %, per km). Requires onAddDriver; no invite. */
  salariedOnly?: boolean;
}

const PHONE_DEBOUNCE_MS = 400;
const MIN_PHONE_LENGTH_FOR_SEARCH = 8;

export function AddDriverModal({ onClose, onComplete, onAddDriver, visible, salariedOnly = false }: AddDriverModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const STEPS_BASE = salariedOnly ? STEPS_SALARIED_ONLY_KEYS : STEPS_FULL_KEYS;
  const STEPS = STEPS_BASE.map((s) => ({ id: s.id, title: t(s.titleKey), description: t(s.descriptionKey) }));
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<DriverFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingMatches, setExistingMatches] = useState<ExistingDriverMatch[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [phoneSearchError, setPhoneSearchError] = useState<string | null>(null);
  const [phoneValidationError, setPhoneValidationError] = useState<string | null>(null);
  const [emergencyPhoneValidationError, setEmergencyPhoneValidationError] = useState<string | null>(null);
  const [selectedMatchUserId, setSelectedMatchUserId] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const searchIdRef = useRef(0);

  const handleImportFromContacts = async () => {
    setError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setFormData((p) => ({ ...p, name: result.contact.name, phone: result.contact.phone }));
      } else if (result.reason === 'no_phone' || result.reason === 'permission_denied' || result.reason === 'unavailable') {
        setError(result.message ?? (result.reason === 'permission_denied' ? t('contactAccessDenied') : t('couldNotLoadContact')));
      }
    } finally {
      setImportLoading(false);
    }
  };

  const validateEmergencyPhone = (phone: string) => {
    const trimmed = phone.trim();
    if (trimmed === '') {
      setEmergencyPhoneValidationError(null);
      return;
    }
    const error = validatePhone(trimmed);
    setEmergencyPhoneValidationError(error);
  };

  // Reset form when modal opens so each open shows empty fields (not previous submission).
  useEffect(() => {
    if (visible === true) {
      setFormData(defaultFormData);
      setError(null);
      setSubmitting(false);
      setExistingMatches([]);
      setPhoneSearchLoading(false);
      setPhoneSearchError(null);
      setPhoneValidationError(null);
      setEmergencyPhoneValidationError(null);
      setSelectedMatchUserId(null);
      setImportLoading(false);
    }
  }, [visible]);

  const step = STEPS[stepIndex];

  // Debounced lookup: when phone changes, after delay search existing drivers (single RPC, O(1) result).
  useEffect(() => {
    const normalized = formData.phone.trim().replace(/\s+/g, '');
    setExistingMatches([]);
    setPhoneSearchError(null);
    setSelectedMatchUserId(null);
    
    // Validate phone
    const phoneError = normalized ? validatePhone(normalized) : null;
    setPhoneValidationError(phoneError);
    
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++searchIdRef.current;
    setPhoneSearchLoading(true);
    const t = setTimeout(() => {
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (searchIdRef.current !== id) return;
        setPhoneSearchLoading(false);
        setPhoneSearchError(err?.message ?? null);
        setExistingMatches(matches);
        if (matches.length === 1) {
          const one = matches[0];
          setSelectedMatchUserId(one.user_id);
          setFormData((prev) =>
            prev.name.trim()
              ? prev
              : {
                  ...prev,
                  name: one.full_name,
                  phone: one.phone,
                  email: one.email?.trim() ?? prev.email,
                  emergencyName: one.emergency_contact_name?.trim() ?? prev.emergencyName,
                  emergencyContact: one.emergency_contact_phone?.trim() ?? prev.emergencyContact,
                  licenseNumber: one.license_number?.trim() ?? prev.licenseNumber,
                }
          );
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [formData.phone]);
  const isReview = step.id === 'review';
  const canProceedDriver = salariedOnly
    ? !!formData.name.trim() && !!formData.phone.trim() && !!formData.licenseNumber.trim() && !phoneValidationError
    : !!formData.phone.trim() && !phoneValidationError;
  const canProceed = step.id === 'driver' ? canProceedDriver : true;

  /**
   * On review: show Send Invitation only when phone maps to an existing driver account.
   * If no existing account is found for this phone, fall back to Add Driver.
   */
  const reviewUseInvite = Boolean(onComplete) && existingMatches.length > 0;

  const handleNext = () => {
    if (isReview) {
      setError(null);
      setSubmitting(true);
      if (reviewUseInvite) {
        const result = onComplete(formData);
        const p = result as void | Promise<unknown>;
        if (typeof p?.then === 'function') {
          p.then(() => {
            setSubmitting(false);
            onClose();
          }).catch((err: Error) => {
            setSubmitting(false);
            setError(err?.message ?? 'Failed to send invitation');
          });
        } else {
          setSubmitting(false);
          onClose();
        }
      } else if (onAddDriver) {
        const result = onAddDriver(formData) as void | Promise<unknown>;
        if (typeof result?.then === 'function') {
          result
            .then(() => {
              setSubmitting(false);
              onClose();
            })
            .catch((err: Error) => {
              setSubmitting(false);
              setError(err?.message ?? 'Failed to add driver');
            });
        } else {
          setSubmitting(false);
          onClose();
        }
      }
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else onClose();
  };

  const inputStyle = [styles.input, { borderColor: Theme.borderInput, backgroundColor: Theme.surfaceForm, color: Theme.textPrimary }];
  const labelStyle = [styles.label, { color: Theme.textMutedDemo }];

  const renderStep = () => {
    switch (step.id) {
      case 'driver':
        return (
          <View style={styles.stepContent}>
            {!salariedOnly && (
              <>
                <Text style={labelStyle}>Driver Source</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.toggleOption,
                      formData.driverSource === 'organization' && styles.toggleOptionActive,
                    ]}
                    onPress={() => setFormData((p) => ({ ...p, driverSource: 'organization' as const }))}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        formData.driverSource === 'organization' && styles.toggleOptionTextActive,
                      ]}
                    >
                      {t('organizationDriver')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleOption, formData.driverSource === 'partner' && styles.toggleOptionActive]}
                    onPress={() => setFormData((p) => ({ ...p, driverSource: 'partner' as const }))}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        formData.driverSource === 'partner' && styles.toggleOptionTextActive,
                      ]}
                    >
                      Partner Driver
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <Text style={labelStyle}>
              Phone number <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TextInput
              testID="driver-phone-input"
              style={inputStyle}
              placeholder="+91 98765 43210"
              placeholderTextColor={Theme.placeholder}
              value={formData.phone}
              onChangeText={(v) => setFormData((p) => ({ ...p, phone: v }))}
              keyboardType="phone-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            {phoneValidationError && (
              <Text style={[styles.errorText, { color: Theme.negative }]}>
                {phoneValidationError}
              </Text>
            )}
            <Text style={labelStyle}>
              Contact name <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TextInput
              testID="driver-name-input"
              style={inputStyle}
              placeholder="e.g. Suresh Kumar"
              placeholderTextColor={Theme.placeholder}
              value={formData.name}
              onChangeText={(v) => setFormData((p) => ({ ...p, name: v }))}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <TouchableOpacity
              style={styles.importFromContactsRow}
              onPress={handleImportFromContacts}
              disabled={importLoading}
              activeOpacity={0.7}
            >
              <View style={styles.importFromContactsIconWrap}>
                {importLoading ? (
                  <ActivityIndicator size="small" color={Theme.buttonMatteBlackText} />
                ) : (
                  <FontAwesome name="address-book-o" size={14} color={Theme.buttonMatteBlackText} />
                )}
              </View>
              <View style={styles.importFromContactsTextWrap}>
                <Text style={styles.importFromContactsText}>
                  {importLoading ? t('linking') : t('importFromContacts')}
                </Text>
                <Text style={styles.importFromContactsSubtitle}>
                  Fill name and phone from your address book.
                </Text>
              </View>
            </TouchableOpacity>
            {salariedOnly ? (
              <>
                <Text style={labelStyle}>
                  DL number (Driving License) <Text style={styles.requiredMark}>*</Text>
                </Text>
                <TextInput
                  style={inputStyle}
                  placeholder="e.g. MH12 20180001234"
                  placeholderTextColor={Theme.placeholder}
                  value={formData.licenseNumber}
                  onChangeText={(v) => setFormData((p) => ({ ...p, licenseNumber: v }))}
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </>
            ) : null}
            {phoneSearchLoading && (
              <View style={styles.existingRow}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.existingHint}>Searching for existing drivers…</Text>
              </View>
            )}
            {!phoneSearchLoading && phoneSearchError && (
              <Text style={[styles.existingError, { color: Theme.negative }]}>{phoneSearchError}</Text>
            )}
            {!phoneSearchLoading && existingMatches.length > 0 && (
              <View style={styles.existingList}>
                <Text style={styles.existingLabel}>{t('existingDriverOnPlatform')}</Text>
                {existingMatches.map((match) => {
                  const inFleet = match.is_in_fleet === true;
                  return (
                    <TouchableOpacity
                      key={match.user_id}
                      style={[
                        styles.existingItem,
                        selectedMatchUserId === match.user_id && styles.existingItemSelected,
                      ]}
                      onPress={() => {
                        setFormData((p) => ({
                          ...p,
                          phone: match.phone,
                          name: match.full_name || p.name,
                          email: match.email?.trim() ?? p.email,
                          emergencyName: match.emergency_contact_name?.trim() ?? p.emergencyName,
                          emergencyContact: match.emergency_contact_phone?.trim() ?? p.emergencyContact,
                          licenseNumber: match.license_number?.trim() ?? p.licenseNumber,
                        }));
                        setSelectedMatchUserId(match.user_id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.existingItemName} numberOfLines={1}>
                        {match.full_name || match.phone || 'Driver'}
                      </Text>
                      {match.phone ? (
                        <Text style={styles.existingItemPhone} numberOfLines={1}>
                          {match.phone}
                        </Text>
                      ) : null}
                      <Text
                        style={inFleet ? styles.existingFleetStatusInFleet : styles.existingFleetStatusNeutral}
                      >
                        {inFleet ? t('existingDriverInFleet') : t('existingDriverNotInFleet')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      case 'contact':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>{t('email')}</Text>
            <TextInput
              style={inputStyle}
              placeholder="driver@email.com"
              placeholderTextColor={Theme.placeholder}
              value={formData.email}
              onChangeText={(v) => setFormData((p) => ({ ...p, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>{t('emergencyContactLabel')}</Text>
            <View style={styles.emergencyBox}>
              <TextInput
                style={inputStyle}
                placeholder="Emergency contact name"
                placeholderTextColor={Theme.placeholder}
                value={formData.emergencyName}
                onChangeText={(v) => setFormData((p) => ({ ...p, emergencyName: v }))}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <TextInput
                style={inputStyle}
                placeholder="Emergency phone number"
                placeholderTextColor={Theme.placeholder}
                value={formData.emergencyContact}
                onChangeText={(v) => {
                  setFormData((p) => ({ ...p, emergencyContact: v }));
                  validateEmergencyPhone(v);
                }}
                keyboardType="phone-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {emergencyPhoneValidationError && (
                <Text style={[styles.errorText, { color: Theme.negative }]}>
                  {emergencyPhoneValidationError}
                </Text>
              )}
            </View>
          </View>
        );
      case 'documents':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>License Number</Text>
            <TextInput
              style={[inputStyle, { fontFamily: 'monospace' }]}
              placeholder="DL-XXXXXXXXXX"
              placeholderTextColor={Theme.placeholder}
              value={formData.licenseNumber}
              onChangeText={(v) => setFormData((p) => ({ ...p, licenseNumber: v }))}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
        );
      case 'salary':
        return (
          <View style={styles.stepContent}>
            <Text style={labelStyle}>Fixed salary (₹, optional)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 25000"
              placeholderTextColor={Theme.placeholder}
              value={formData.payableAmount != null && formData.payableAmount !== 0 ? String(formData.payableAmount) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                setFormData((p) => ({ ...p, payableAmount: n != null && !Number.isNaN(n) ? n : null }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>Commission (%)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 10"
              placeholderTextColor={Theme.placeholder}
              value={formData.commissionPercent != null && formData.commissionPercent !== 0 ? String(formData.commissionPercent) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                const val = n != null && !Number.isNaN(n) ? Math.min(100, Math.max(0, n)) : null;
                setFormData((p) => ({ ...p, commissionPercent: val }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={labelStyle}>Per km (₹/km)</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 8"
              placeholderTextColor={Theme.placeholder}
              value={formData.commissionPerKm != null && formData.commissionPerKm !== 0 ? String(formData.commissionPerKm) : ''}
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                setFormData((p) => ({ ...p, commissionPerKm: n != null && !Number.isNaN(n) && n >= 0 ? n : null }));
              }}
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
        );
      case 'review':
        return (
          <ScrollView style={styles.reviewScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.reviewCard}>
              <Text style={styles.reviewName}>{formData.name || 'New Driver'}</Text>
              <Text style={styles.reviewSub}>
                {formData.driverSource === 'organization' ? t('organizationDriver') : t('partnerDriver')}
              </Text>
              <Text style={styles.reviewSub}>Pending Invitation</Text>
              <Text style={[styles.reviewSub, { marginTop: 8 }]}>{formData.phone}</Text>
              {formData.email ? <Text style={styles.reviewSub}>{formData.email}</Text> : null}
              {formData.licenseNumber ? (
                <Text style={styles.reviewSub}>License: {formData.licenseNumber}</Text>
              ) : null}
              {(formData.payableAmount != null && formData.payableAmount > 0) ||
              (formData.commissionPercent != null && formData.commissionPercent > 0) ||
              (formData.commissionPerKm != null && formData.commissionPerKm > 0) ? (
                <View style={styles.emergencyReview}>
                  <Text style={styles.reviewLabel}>Offer</Text>
                  <Text style={styles.reviewValue}>
                    {formData.payableAmount != null && formData.payableAmount > 0 && `Salary: ₹${formData.payableAmount.toLocaleString('en-IN')} `}
                    {formData.commissionPercent != null && formData.commissionPercent > 0 && `Commission: ${formData.commissionPercent}% `}
                    {formData.commissionPerKm != null && formData.commissionPerKm > 0 && `Per km: ₹${formData.commissionPerKm}/km`}
                  </Text>
                </View>
              ) : null}
              {(formData.emergencyName || formData.emergencyContact) && (
                <View style={styles.emergencyReview}>
                  <Text style={styles.reviewLabel}>{t('emergencyContactLabel')}</Text>
                  <Text style={styles.reviewValue}>
                    {formData.emergencyName} - {formData.emergencyContact}
                  </Text>
                </View>
              )}
            </View>
            {onAddDriver && (
              <TouchableOpacity
                style={[styles.addDriverBtn, submitting && styles.addDriverBtnDisabled]}
                disabled={submitting}
                onPress={async () => {
                  setError(null);
                  setSubmitting(true);
                  const result = onAddDriver(formData) as void | Promise<unknown>;
                  if (typeof result?.then === 'function') {
                    result
                      .then(() => {
                        setSubmitting(false);
                        onClose();
                      })
                      .catch((err: Error) => {
                        setSubmitting(false);
                        setError(err?.message ?? 'Failed to add driver');
                      });
                  } else {
                    setSubmitting(false);
                    onClose();
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.addDriverBtnText}>{submitting ? 'Adding…' : 'Add Driver'}</Text>
              </TouchableOpacity>
            )}
            {error ? (
              <Text style={[styles.errorText, { color: Theme.negative }]}>{error}</Text>
            ) : null}
          </ScrollView>
        );
      default:
        return null;
    }
  };

  if (visible === false) return null;

  if (visible === true) {
    const windowHeight = Dimensions.get('window').height;
    const panelHeight = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight
    );
    const footerRightLabel =
      isReview && submitting
        ? (reviewUseInvite ? t('sending') : t('adding'))
        : isReview
          ? (reviewUseInvite ? t('sendInvitation') : t('addDriver'))
          : 'Continue';
    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="overFullScreen"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={insets.top + 16}
        >
          <View style={popupStyles.backdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            <View
              style={[
                popupStyles.panel,
                {
                  paddingBottom: insets.bottom + Layout.modalBottomPadding,
                  height: panelHeight,
                  maxHeight: panelHeight,
                },
              ]}
            >
              <View style={popupStyles.headerRow}>
                <Text style={popupStyles.title}>{salariedOnly ? 'Add Driver (Salaried)' : 'Add Driver'}</Text>
              </View>
              <View style={popupStyles.dotsRow}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[popupStyles.dot, i === stepIndex && popupStyles.dotActive]} />
                ))}
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={popupStyles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={popupStyles.scrollContent}
              >
                {renderStep()}
              </ScrollView>
              <View style={popupStyles.footer}>
                <TouchableOpacity style={popupStyles.footerLeft} onPress={handleBack}>
                  <Text style={popupStyles.footerLeftText}>{stepIndex > 0 ? 'Back' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={isReview ? 'invite-submit-btn' : undefined}
                  style={[
                    popupStyles.footerRight,
                    (submitting || (!isReview && !canProceed)) && popupStyles.footerRightDisabled,
                  ]}
                  onPress={handleNext}
                  disabled={submitting || (!isReview && !canProceed)}
                >
                  <Text style={popupStyles.footerRightText}>{footerRightLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <WizardStepLayout
      title="Add Driver"
      stepLabel={step.title}
      stepIndex={stepIndex}
      stepCount={STEPS.length}
      onBack={handleBack}
      onClose={onClose}
      footerLeftLabel={stepIndex > 0 ? 'Back' : 'Cancel'}
      footerRightLabel={
        isReview && submitting
          ? (reviewUseInvite ? t('sending') : t('adding'))
          : isReview
            ? (reviewUseInvite ? t('sendInvitation') : t('addDriver'))
            : 'Continue'
      }
      onFooterLeft={handleBack}
      onFooterRight={handleNext}
      footerRightDisabled={submitting || (!isReview && !canProceed)}
      footerRightTestID={isReview ? 'invite-submit-btn' : undefined}
    >
      {renderStep()}
    </WizardStepLayout>
  );
}

const styles = StyleSheet.create({
  stepContent: { gap: 14 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
  },
  requiredMark: {
    color: Theme.negative,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
  toggleOptionActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceLight,
  },
  toggleOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  toggleOptionTextActive: {
    color: Theme.textPrimaryDark,
  },
  importFromContactsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: Theme.screenBackground,
  },
  importFromContactsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importFromContactsTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  importFromContactsText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  importFromContactsSubtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  existingHint: {
    fontSize: 12,
    color: Theme.textMutedDemo,
  },
  existingError: {
    fontSize: 12,
    marginBottom: 4,
  },
  existingList: {
    gap: 8,
    marginBottom: 4,
  },
  existingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  existingItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  existingItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  existingItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  existingItemPhone: {
    fontSize: 12,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  /** Driver is linked to at least one org with left_at IS NULL — warn dispatcher. */
  existingFleetStatusInFleet: {
    fontSize: 11,
    marginTop: 6,
    color: Theme.negative,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  /** Driver account exists but no active drivers row — invite flow is appropriate. */
  existingFleetStatusNeutral: {
    fontSize: 11,
    marginTop: 6,
    color: Theme.textMutedDemo,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 52,
    backgroundColor: Theme.screenBackground,
  },
  emergencyBox: { gap: 12 },
  reviewScroll: { flex: 1 },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
  },
  reviewName: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark, textTransform: 'uppercase' },
  reviewSub: { fontSize: 12, color: Theme.textMutedDemo },
  reviewLabel: { fontSize: 10, color: Theme.textMutedDemo, marginTop: 8, textTransform: 'uppercase' },
  reviewValue: { fontSize: 14, color: Theme.textPrimary },
  emergencyReview: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Theme.borderLight },
  addDriverBtn: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  addDriverBtnDisabled: { opacity: 0.6 },
  addDriverBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorText: { fontSize: 12, marginTop: 12, marginBottom: 4 },
});

const popupStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.borderInput,
  },
  dotActive: {
    backgroundColor: Theme.textPrimaryDark,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingBottom: 8,
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  footerLeft: { paddingVertical: 6, paddingHorizontal: 4 },
  footerLeftText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerRight: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    backgroundColor: Theme.buttonMatteBlack,
  },
  footerRightDisabled: { opacity: 0.5 },
  footerRightText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.buttonMatteBlackText,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
