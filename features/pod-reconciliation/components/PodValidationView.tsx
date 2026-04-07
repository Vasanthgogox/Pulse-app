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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { runOCR } from '@/lib/pod/ocr';
import { chatWithDocument } from '@/lib/pod/chat';
import { compressImage } from '@/lib/pod/imageCompression';
import type { PodReconciliationTripView } from '../services/podReconciliationService';

interface PodValidationViewProps {
  trip: PodReconciliationTripView | null;
  onClose: () => void;
  isTablet?: boolean;
}

export function PodValidationView({ trip, onClose, isTablet }: PodValidationViewProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [shortage, setShortage] = useState('0');
  const [damage, setDamage] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'chat'>('audit');


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
    enabled: !!trip?.internal_id
  });

  const getFileUrl = (path: string) => {
    return supabase().storage.from('pod-documents').getPublicUrl(path).data.publicUrl;
  };

  
  const handleScanWithAI = async (docPath: string, fileName: string) => {
    try {
      setIsScanning(true);
      setScanProgress(5);
      
      const url = getFileUrl(docPath);
      const response = await fetch(url);
      const blob = await response.blob();
      
      setScanProgress(15);
      const finalFile = await compressImage(blob, 1200);
      
      setScanProgress(30);
      const result = await runOCR(finalFile, fileName, setScanProgress);
      
      if (result.extraction.financials) {
        if (result.extraction.financials.shortage_amount?.value) {
          setShortage(String(result.extraction.financials.shortage_amount.value));
        }
        if (result.extraction.financials.damage_amount?.value) {
          setDamage(String(result.extraction.financials.damage_amount.value));
        }
      }
      Alert.alert('AI Scan Complete', `Extracted data in ${result.processingTime.toFixed(1)}s`);
    } catch (err) {
      console.error(err);
      Alert.alert('Scan Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || attachments.length === 0) return;
    
    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const doc = attachments[0]; // chat with the first attachment for now
      const url = getFileUrl(doc.file_path);
      const response = await fetch(url);
      const blob = await response.blob();
      const finalFile = await compressImage(blob, 1200);

      const reply = await chatWithDocument(await finalFile.arrayBuffer(), doc.file_type || 'image/jpeg', chatMessages, userMessage);
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!trip) return;
    try {
      setIsSubmitting(true);
      
      const s = parseFloat(shortage) || 0;
      const d = parseFloat(damage) || 0;
      const p = parseFloat(penalty) || 0;
      const totalDeductions = s + d + p;

      if (totalDeductions > (trip.total_client_value || 0)) {
        Alert.alert('Validation Error', 'Total deductions cannot exceed the trip amount.');
        setIsSubmitting(false);
        return;
      }

      const finalAmount = (trip.total_client_value || 0) - totalDeductions;

      const { error: tripError } = await supabase()
        .from("trips")
        .update({ 
          client_price: finalAmount, // Updated from total_client_value for q-web compatibility
          pod_status: 'Received',
          invoice_status_1: 'Pending',
          pod_received_date: trip.pod_received_date || new Date().toISOString().split('T')[0],
          audit_shortage: s,
          audit_damage: d,
          audit_penalty: p,
          audit_remarks: remarks,
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

  const amount = trip?.total_client_value ?? 0;

  const content = (
    <>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

      <View style={styles.tabContainer}>
        <Pressable style={[styles.tab, activeTab === 'audit' && styles.tabActive]} onPress={() => setActiveTab('audit')}>
          <Text style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>Audit</Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 'chat' && styles.tabActive]} onPress={() => setActiveTab('chat')}>
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>AI Chat</Text>
        </Pressable>
      </View>

        {activeTab === 'audit' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Trip Details</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Client" value={trip.client_name || ''} />
            <InfoRow label="Route" value={`${trip.pp_location || ''} ➔ ${trip.drop_point || ''}`} />
            <InfoRow label="Amount" value={`₹${amount.toLocaleString()}`} />
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
                  {att.file_type && att.file_type.startsWith('image/') ? (
                    <Image 
                      source={{ uri: getFileUrl(att.file_path) }} 
                      style={{ width: '100%', height: 100, borderRadius: 8 }} 
                      resizeMode="cover"
                    />
                  ) : (
                    <FontAwesome name="file-pdf-o" size={40} color={Theme.primary} />
                  )}
                  <Text style={styles.attachmentName} numberOfLines={1}>{att.file_name}</Text>
                  
                  <Pressable 
                    style={styles.scanBtn} 
                    onPress={() => handleScanWithAI(att.file_path, att.file_name)}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <FontAwesome name="magic" size={12} color="#fff" />
                        <Text style={styles.scanBtnText}>Scan</Text>
                      </>
                    )}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        </>
      )}

      {activeTab === 'chat' && (
        <View style={styles.chatSection}>
          <ScrollView style={styles.chatHistory}>
            {chatMessages.length === 0 && (
              <Text style={styles.emptyText}>Ask questions about the attached PODs (e.g. "Why is there a delay penalty?").</Text>
            )}
            {chatMessages.map((m, i) => (
              <View key={i} style={[styles.chatBubble, m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
                <Text style={m.role === 'user' ? styles.chatText : styles.chatTextAssistant}>{m.content}</Text>
              </View>
            ))}
            {isChatLoading && (
              <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                <ActivityIndicator size="small" color={Theme.primary} />
              </View>
            )}
          </ScrollView>
          <View style={styles.chatInputWrapper}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask AI..."
              placeholderTextColor={Theme.textMuted}
            />
            <Pressable style={styles.chatSendBtn} onPress={handleChatSubmit} disabled={isChatLoading || !chatInput.trim()}>
              <FontAwesome name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
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
    </>
  );

  if (isTablet) {
    return (
      <View style={styles.tabletContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Validate POD</Text>
            <Text style={styles.headerSub}>{trip.id}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <FontAwesome name="times" size={20} color={Theme.textMuted} />
          </Pressable>
        </View>
        {content}
      </View>
    );
  }

  return (
    <Modal visible animationType="slide" transparent>
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
          {content}
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
  attachmentItem: { width: 150, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Theme.borderLight },
  attachmentName: { fontSize: 10, color: Theme.textPrimaryDark, fontWeight: '600' },
  emptyText: { fontSize: 13, color: Theme.textMuted, fontStyle: 'italic' },
  footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  submitBtn: { backgroundColor: Theme.primary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tabletContainer: { flex: 1, backgroundColor: Theme.screenBackground },
  tabContainer: { flexDirection: 'row', gap: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Theme.borderLight },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Theme.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase' },
  tabTextActive: { color: Theme.primary },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.textPrimaryDark, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, width: '100%', marginTop: 8 },
  scanBtnText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  chatSection: { flex: 1, minHeight: 300, paddingBottom: 24 },
  chatHistory: { flex: 1, marginBottom: 16 },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: '85%', marginBottom: 12 },
  chatBubbleUser: { backgroundColor: Theme.primary, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  chatBubbleAssistant: { backgroundColor: Theme.cardWhite, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: Theme.borderLight },
  chatText: { fontSize: 13, color: '#fff', fontWeight: '500' },
  chatTextAssistant: { fontSize: 13, color: Theme.textPrimaryDark, fontWeight: '500' },
  chatInputWrapper: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  chatSendBtn: { backgroundColor: Theme.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

});
