/**
 * Create Post modal — UPDATE (business update) or LOAD (load post with bidding).
 * Full-screen modal flow with type selector and form.
 */
import Theme from '@/constants/Theme';
import { createPost } from '@/features/network/services/posts.service';
import { useInvalidatePosts } from '@/lib/queries';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatINR } from '@/lib/format';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  FileText,
  MapPin,
  Package,
  Truck,
  Zap,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PostType = 'UPDATE' | 'LOAD';

const VEHICLE_TYPES = ['20ft', '32ft', 'SXL', 'MXL', 'Tanker', 'Container', 'Open Body', 'Trailer'];

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const invalidatePosts = useInvalidatePosts(orgId);

  const [type, setType] = useState<PostType>('UPDATE');
  const [content, setContent] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [material, setMaterial] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = type === 'UPDATE'
    ? content.trim().length > 0
    : origin.trim().length > 0 && destination.trim().length > 0;

  const handleSubmit = async () => {
    if (!orgId || !canSubmit) return;
    setSubmitting(true);

    const parsed = parseFloat(rate.replace(/,/g, ''));
    const weightParsed = parseFloat(weight);

    const { error } = await createPost({
      organizationId: orgId,
      type,
      content: content.trim() || undefined,
      origin: origin.trim() || undefined,
      destination: destination.trim() || undefined,
      vehicleType: vehicleType || undefined,
      weightTonnes: isNaN(weightParsed) ? undefined : weightParsed,
      rateOffer: isNaN(parsed) ? undefined : parsed,
      material: material.trim() || undefined,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    invalidatePosts();
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Post</Text>
        <Pressable
          style={[styles.publishBtn, !canSubmit && styles.publishBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <ActivityIndicator size={14} color="#fff" />
          ) : (
            <Text style={styles.publishBtnText}>Publish</Text>
          )}
        </Pressable>
      </View>

      {/* Type Selector */}
      <View style={styles.typeSelector}>
        <Pressable
          style={[styles.typeBtn, type === 'UPDATE' && styles.typeBtnActive]}
          onPress={() => setType('UPDATE')}
        >
          <FileText size={16} color={type === 'UPDATE' ? '#fff' : Theme.textSecondary} />
          <Text style={[styles.typeBtnText, type === 'UPDATE' && styles.typeBtnTextActive]}>
            Business Update
          </Text>
        </Pressable>
        <Pressable
          style={[styles.typeBtn, type === 'LOAD' && styles.typeBtnActiveLoad]}
          onPress={() => setType('LOAD')}
        >
          <Truck size={16} color={type === 'LOAD' ? '#fff' : Theme.textSecondary} />
          <Text style={[styles.typeBtnText, type === 'LOAD' && styles.typeBtnTextActive]}>
            Load Post
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Business Update */}
          {type === 'UPDATE' && (
            <View style={styles.updateForm}>
              <View style={styles.orgBadge}>
                <Zap size={12} color={Theme.primary} />
                <Text style={styles.orgBadgeText}>{organization?.name}</Text>
              </View>
              <TextInput
                style={styles.updateInput}
                placeholder={"Share a business update, route announcement, or news with your network..."}
                placeholderTextColor={Theme.textSecondary}
                value={content}
                onChangeText={setContent}
                multiline
                autoFocus
                maxLength={500}
              />
              <Text style={styles.charCount}>{content.length}/500</Text>
            </View>
          )}

          {/* Load Post */}
          {type === 'LOAD' && (
            <View style={styles.loadForm}>
              <View style={styles.routeSection}>
                <View style={styles.fieldGroup}>
                  <View style={[styles.fieldDot, { backgroundColor: '#10b981' }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>PICKUP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Chennai, Tamil Nadu"
                      placeholderTextColor={Theme.textSecondary}
                      value={origin}
                      onChangeText={setOrigin}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                <View style={styles.routeDivider} />

                <View style={styles.fieldGroup}>
                  <View style={[styles.fieldDot, { backgroundColor: Theme.primary }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>DROP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Delhi, NCR"
                      placeholderTextColor={Theme.textSecondary}
                      value={destination}
                      onChangeText={setDestination}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>

              {/* Vehicle Type */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>VEHICLE TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {VEHICLE_TYPES.map((v) => (
                    <Pressable
                      key={v}
                      style={[styles.chip, vehicleType === v && styles.chipActive]}
                      onPress={() => setVehicleType(vehicleType === v ? '' : v)}
                    >
                      {vehicleType === v && <Check size={11} color="#fff" strokeWidth={3} />}
                      <Text style={[styles.chipText, vehicleType === v && styles.chipTextActive]}>{v}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Weight & Material */}
              <View style={styles.rowFields}>
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>WEIGHT (TONNES)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 20"
                      placeholderTextColor={Theme.textSecondary}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>MATERIAL</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Steel"
                      placeholderTextColor={Theme.textSecondary}
                      value={material}
                      onChangeText={setMaterial}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>

              {/* Offered Rate */}
              <View style={styles.rateSection}>
                <Text style={styles.fieldLabel}>EXPECTED RATE (₹) — OPTIONAL</Text>
                <View style={styles.rateInputRow}>
                  <Text style={styles.ratePrefix}>₹</Text>
                  <TextInput
                    style={styles.rateInput}
                    placeholder="Leave blank to invite bids"
                    placeholderTextColor={Theme.textSecondary}
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Additional Notes */}
              <View style={styles.section}>
                <Text style={styles.fieldLabel}>ADDITIONAL NOTES</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Any special instructions, loading conditions..."
                  placeholderTextColor={Theme.textSecondary}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  publishBtn: {
    backgroundColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  publishBtnDisabled: { opacity: 0.4 },
  publishBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  typeSelector: {
    flexDirection: 'row',
    margin: 16,
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  typeBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  typeBtnActiveLoad: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  typeBtnTextActive: { color: '#fff' },
  form: { flex: 1 },
  formContent: { padding: 16 },
  updateForm: {},
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.primary + '12',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  orgBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.primary,
  },
  updateInput: {
    fontSize: 16,
    color: Theme.textPrimary,
    fontWeight: '500',
    lineHeight: 24,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: Theme.textSecondary,
    textAlign: 'right',
    marginTop: 8,
  },
  loadForm: { gap: 16 },
  routeSection: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  fieldGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 18,
  },
  fieldContent: { flex: 1 },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldInput: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    paddingBottom: 6,
  },
  routeDivider: {
    width: 1,
    height: 20,
    backgroundColor: Theme.borderMedium,
    marginLeft: 4,
    marginVertical: 6,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  chipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  chipTextActive: { color: '#fff' },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: { flex: 1 },
  rateSection: {
    backgroundColor: Theme.primary + '08',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.primary + '30',
    padding: 14,
    gap: 8,
  },
  rateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratePrefix: {
    fontSize: 24,
    fontWeight: '900',
    color: Theme.primary,
  },
  rateInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  notesInput: {
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: '500',
    lineHeight: 20,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
    minHeight: 80,
  },
});
