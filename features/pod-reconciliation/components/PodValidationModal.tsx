import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PodReconciliationTripView } from '../services/podReconciliationService';

interface PodValidationModalProps {
  trip: PodReconciliationTripView | null;
  visible: boolean;
  onClose: () => void;
}

export function PodValidationModal({ trip, visible, onClose }: PodValidationModalProps) {
  const queryClient = useQueryClient();
  const [shortage, setShortage] = useState('0');
  const [damage, setDamage] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['pod-attachments', trip?.internal_id],
    queryFn: async () => {
      if (!trip?.internal_id) return [];
      const { data, error } = await supabase()
        .from('pod_attachments')
        .select('*')
        .eq('trip_id', trip.internal_id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!trip?.internal_id && visible
  });

  const getFileUrl = (path: string) => {
    return supabase().storage.from('pod-documents').getPublicUrl(path).data.publicUrl;
  };

  const handleValidate = async () => {
    if (!trip) return;
    try {
      setIsSubmitting(true);
      
      const s = parseFloat(shortage) || 0;
      const d = parseFloat(damage) || 0;
      const p = parseFloat(penalty) || 0;
      const totalDeductions = s + d + p;
      const finalAmount = (trip.amount || 0) - totalDeductions;

      const { error: tripError } = await supabase()
        .from("trips")
        .update({ 
          client_price: finalAmount, // Updated from total_client_value for q-web compatibility
          pod_status: 'Received',
          invoice_status_1: 'Pending',
          pod_received_date: trip.pod_received_date || new Date().toISOString().split('T')[0],
          // Keep these for compatibility if columns exist, they will be ignored if not (PostgREST won't fail if column is missing on update? Wait, actually it will fail if column is missing)
          // So I should only include them if I'm sure they exist. 
          // Since I'm NOT sure, I'll append them to remarks/notes for now if they are non-zero.
          notes: (trip.notes || '') + `\nAudit: S:${s} D:${d} P:${p}. ${remarks}`.trim()
        })
        .eq("id", trip.internal_id);

      if (tripError) throw tripError;

      const { error: lrError } = await supabase()
        .from("trip_lrs")
        .update({ 
          invoice_status: 'Ready for Invoice',
          pod_status: 'Received',
          pod_received: true,
          status: 'delivered'
        })
        .eq("trip_id", trip.internal_id); // Use internal_id (UUID) instead of trip.id (display ID)

      if (lrError) console.error("Error syncing LRs:", lrError);

      Alert.alert('Success', 'POD validated successfully.');
      queryClient.invalidateQueries({ queryKey: ['q', 'trips', 'reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['q', 'invoicing', 'summary'] });
      onClose();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to validate POD');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!trip) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Validate POD</Text>
              <Text style={styles.headerSub}>{trip.id}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <FontAwesome name="times" size={20} color={Theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Trip Details</Text>
              <View style={styles.infoCard}>
                <InfoRow label="Client" value={trip.client_name} />
                <InfoRow label="Route" value={`${trip.pp_location} ➔ ${trip.drop_point}`} />
                <InfoRow label="Amount" value={`₹${trip.amount.toLocaleString()}`} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Audit Adjustments</Text>
              <View style={styles.inputCard}>
                <AuditInput label="Shortage" value={shortage} onChange={setShortage} />
                <AuditInput label="Damage" value={damage} onChange={setDamage} />
                <AuditInput label="Penalty" value={penalty} onChange={setPenalty} />
                <View style={styles.remarksBox}>
                  <Text style={styles.inputLabel}>Remarks</Text>
                  <TextInput
                    style={styles.textArea}
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Add audit notes..."
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Attachments ({attachments.length})</Text>
              {isLoadingAttachments ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : attachments.length === 0 ? (
                <Text style={styles.emptyText}>No documents attached.</Text>
              ) : (
                <View style={styles.attachmentGrid}>
                  {attachments.map((att: any) => (
                    <Pressable key={att.id} style={styles.attachmentItem}>
                      <FontAwesome name="file-pdf-o" size={24} color={Theme.primary} />
                      <Text style={styles.attachmentName} numberOfLines={1}>{att.file_name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleValidate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Approve Invoicing</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function AuditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.auditInputRow}>
      <Text style={styles.auditInputLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Text style={styles.currencyPrefix}>₹</Text>
        <TextInput
          style={styles.auditTextInput}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Theme.overlayBackdrop, justifyContent: 'flex-end' },
  sheet: { 
    backgroundColor: Theme.screenBackground, 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    height: '90%',
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: Theme.borderLight 
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark },
  headerSub: { fontSize: 12, color: Theme.textMuted, fontWeight: '600', marginTop: 2 },
  content: { flex: 1, padding: 20 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  infoCard: { backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: Theme.borderLight },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 12, color: Theme.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 12, color: Theme.textPrimaryDark, fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 20 },
  inputCard: { backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 16, gap: 16, borderWidth: 1, borderColor: Theme.borderLight },
  auditInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditInputLabel: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 8, paddingHorizontal: 12, width: 120, height: 40, borderWidth: 1, borderColor: Theme.borderInput },
  currencyPrefix: { fontSize: 14, color: Theme.textMuted, marginRight: 4, fontWeight: '700' },
  auditTextInput: { flex: 1, fontSize: 14, fontWeight: '800', color: Theme.textPrimaryDark, textAlign: 'right' },
  remarksBox: { marginTop: 8 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark, marginBottom: 8 },
  textArea: { backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12, fontSize: 13, color: Theme.textPrimaryDark, height: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: Theme.borderInput },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  attachmentItem: { width: '47%', backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Theme.borderLight },
  attachmentName: { fontSize: 10, color: Theme.textPrimaryDark, fontWeight: '600' },
  emptyText: { fontSize: 13, color: Theme.textMuted, fontStyle: 'italic' },
  footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  submitBtn: { backgroundColor: Theme.primary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
