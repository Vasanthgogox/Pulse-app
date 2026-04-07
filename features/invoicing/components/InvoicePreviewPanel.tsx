import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import type { AdditionalCharge, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { useInvoiceCalc } from '@/features/invoicing/hooks/useInvoiceCalc';

export interface InvoicePreviewPanelProps {
  onClose?: () => void;
  onFinalize: (internalIds: string[]) => Promise<void>;
  isFinalizing: boolean;
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
  isStandalone?: boolean;
}

export function InvoicePreviewPanel({
  onClose,
  onFinalize,
  isFinalizing,
  activeClient,
  selectedTrips,
  isStandalone = false,
}: InvoicePreviewPanelProps) {
  const insets = useSafeAreaInsets();
  
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [notes, setNotes] = useState('');
  const [includeGst, setIncludeGst] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [includeFuel, setIncludeFuel] = useState(false);
  const [fuelRate, setFuelRate] = useState(2.5);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);

  const calculations = useInvoiceCalc(selectedTrips, {
    includeGst,
    gstRate,
    includeFuel,
    fuelRate,
    additionalCharges,
  });

  const handleAddCharge = useCallback((tripId?: string) => {
    setAdditionalCharges((prev) => [
      ...prev,
      { id: Date.now().toString(), description: '', amount: 0, tripId },
    ]);
  }, []);

  const handleUpdateCharge = useCallback((id: string, field: 'description' | 'amount', value: string | number) => {
    setAdditionalCharges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  }, []);

  const handleRemoveCharge = useCallback((id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const formatCurrency = (val: number) => {
    return '₹' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleFinalize = async () => {
    if (selectedTrips.length === 0) return;
    const internalIds = selectedTrips.map((t) => t.internal_id);
    await onFinalize(internalIds);
  };

  return (
    <View style={[styles.sheet, !isStandalone && { paddingTop: insets.top > 0 ? insets.top : 16 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Invoice Draft <Text style={{ color: Theme.textMuted }}>#INV-DRAFT</Text></Text>
          <Text style={styles.headerSub}>Configure tax, fuel, and adjustments</Text>
        </View>
        {onClose && (
          <Pressable style={styles.closeBtn} onPress={onClose} disabled={isFinalizing}>
            <FontAwesome name="times" size={20} color={Theme.textPrimaryDark} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Header Info */}
        <View style={styles.rowLayout}>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Billing Address</Text>
            <View style={styles.infoCard}>
              {activeClient ? (
                <>
                  <Text style={styles.clientName}>{activeClient}</Text>
                  <Text style={styles.clientAddress}>Corporate House, HQ</Text>
                  <Text style={styles.clientAddress}>City Center, State - 000000</Text>
                </>
              ) : (
                <Text style={styles.clientAddress}>Select a client...</Text>
              )}
            </View>
          </View>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Tax Details</Text>
            <View style={styles.infoCard}>
              <Text style={styles.taxText}><Text style={styles.taxLabel}>GSTIN</Text> 24AAA CA000 1Z1</Text>
              <Text style={styles.taxText}><Text style={styles.taxLabel}>PAN</Text> AAAC0000A</Text>
              <Text style={styles.taxText}><Text style={styles.taxLabel}>State</Text> 24</Text>
            </View>
          </View>
        </View>

        {/* Config Toggles */}
        <View style={styles.configBlock}>
          <Text style={styles.sectionLabel}>Configuration</Text>
          
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Include GST (5%)</Text>
              <Text style={styles.toggleSub}>Calculates CGST & SGST at 2.5% each</Text>
            </View>
            <Switch 
              value={includeGst} 
              onValueChange={setIncludeGst}
              trackColor={{ true: Theme.primary, false: Theme.borderMedium }}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Include Fuel Surcharge (2.5%)</Text>
              <Text style={styles.toggleSub}>Calculated on base freight</Text>
            </View>
            <Switch 
              value={includeFuel} 
              onValueChange={setIncludeFuel}
              trackColor={{ true: Theme.primary, false: Theme.borderMedium }}
            />
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Invoice Details</Text>
          <Pressable style={styles.addChargeBtn} onPress={() => handleAddCharge()}>
            <FontAwesome name="plus" size={12} color={Theme.primary} />
            <Text style={styles.addChargeText}>Add Custom Charge</Text>
          </Pressable>
        </View>

        {/* Global Charges */}
        {additionalCharges.filter(c => !c.tripId).map(charge => (
          <View key={charge.id} style={styles.chargeRow}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <TextInput
                style={styles.chargeInput}
                value={charge.description}
                onChangeText={(t) => handleUpdateCharge(charge.id, 'description', t)}
                placeholder="Charge description..."
                placeholderTextColor={Theme.textMuted}
              />
              <Text style={styles.chargeHint}>Global Adjustment</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={styles.chargeAmountInput}
                value={charge.amount.toString()}
                onChangeText={(t) => handleUpdateCharge(charge.id, 'amount', parseFloat(t) || 0)}
                keyboardType="numeric"
              />
              <Pressable onPress={() => handleRemoveCharge(charge.id)}>
                <FontAwesome name="times" size={16} color={Theme.textMuted} />
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.tripsList}>
          {selectedTrips.length === 0 && (
            <View style={styles.emptyTrips}>
              <Text style={styles.emptyTripsText}>No trips selected</Text>
            </View>
          )}
          {selectedTrips.map(trip => {
            const tripCharges = additionalCharges.filter(c => c.tripId === trip.id);
            return (
              <View key={trip.id} style={styles.tripItemWrapper}>
                <View style={styles.tripItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripItemTitle}>
                      <Text style={{ color: Theme.primary }}>{trip.id}</Text> <Text style={{ color: Theme.textMuted }}>•</Text> {trip.date}
                    </Text>
                    <Text style={styles.tripItemRoute} numberOfLines={1}>{trip.route}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.tripItemAmount}>{formatCurrency(trip.amount)}</Text>
                    <Pressable onPress={() => handleAddCharge(trip.id)} style={{ marginTop: 4 }}>
                      <Text style={styles.addTripChargeText}>+ Adjust</Text>
                    </Pressable>
                  </View>
                </View>
                {tripCharges.map(charge => (
                  <View key={charge.id} style={styles.tripChargeRow}>
                    <View style={{ flex: 1, paddingRight: 16 }}>
                      <TextInput
                        style={styles.chargeInput}
                        value={charge.description}
                        onChangeText={(t) => handleUpdateCharge(charge.id, 'description', t)}
                        placeholder="Trip adjustment..."
                        placeholderTextColor={Theme.textMuted}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={styles.chargeAmountInput}
                        value={charge.amount.toString()}
                        onChangeText={(t) => handleUpdateCharge(charge.id, 'amount', parseFloat(t) || 0)}
                        keyboardType="numeric"
                      />
                      <Pressable onPress={() => handleRemoveCharge(charge.id)}>
                        <FontAwesome name="times" size={16} color={Theme.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* Calculations */}
        <View style={styles.calcBlock}>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Base Freight Total</Text>
            <Text style={styles.calcVal}>{formatCurrency(calculations.baseFreightTotal)}</Text>
          </View>
          {calculations.additionalTotal !== 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Adjustments</Text>
              <Text style={styles.calcVal}>{formatCurrency(calculations.additionalTotal)}</Text>
            </View>
          )}
          {calculations.fuelSurcharge > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Fuel Surcharge ({fuelRate}%)</Text>
              <Text style={styles.calcVal}>{formatCurrency(calculations.fuelSurcharge)}</Text>
            </View>
          )}
          <View style={[styles.calcRow, styles.calcSubtotal]}>
            <Text style={styles.calcLabelSubtotal}>Subtotal</Text>
            <Text style={styles.calcValSubtotal}>{formatCurrency(calculations.subtotal)}</Text>
          </View>
          {calculations.sgst > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>SGST ({calculations.sgstRate}%)</Text>
              <Text style={styles.calcVal}>{formatCurrency(calculations.sgst)}</Text>
            </View>
          )}
          {calculations.cgst > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>CGST ({calculations.cgstRate}%)</Text>
              <Text style={styles.calcVal}>{formatCurrency(calculations.cgst)}</Text>
            </View>
          )}
          <View style={styles.calcTotalRow}>
            <Text style={styles.calcTotalLabel}>Total Invoice Value</Text>
            <Text style={styles.calcTotalVal}>{formatCurrency(calculations.totalAmount)}</Text>
          </View>
        </View>

      </ScrollView>

      <View style={[styles.footer, !isStandalone && { paddingBottom: insets.bottom + 16 }]}>
        {onClose && (
          <Pressable style={styles.footerBtnOutline} onPress={onClose} disabled={isFinalizing}>
            <Text style={styles.footerBtnOutlineText}>Cancel</Text>
          </Pressable>
        )}
        <Pressable 
          style={[styles.footerBtnPrimary, (isFinalizing || selectedTrips.length === 0) && styles.btnDisabled]} 
          onPress={handleFinalize}
          disabled={isFinalizing || selectedTrips.length === 0}
        >
          {isFinalizing ? (
            <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
          ) : (
            <>
              <FontAwesome name="send" size={14} color={Theme.buttonPrimaryText} style={{ marginRight: 8 }} />
              <Text style={styles.footerBtnPrimaryText}>Finalize & Send</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.surface,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
    paddingTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', letterSpacing: 1 },
  headerSub: { fontSize: 12, color: Theme.textMuted, marginTop: 4 },
  closeBtn: { padding: 8 },
  
  body: { flex: 1, backgroundColor: Theme.screenBackground },
  bodyContent: { padding: Layout.screenPaddingHorizontal, paddingBottom: 40, paddingTop: 16 },
  
  rowLayout: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  colLayout: { flex: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  
  infoCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
  },
  clientName: { fontSize: 12, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', marginBottom: 4 },
  clientAddress: { fontSize: 11, fontWeight: '700', color: Theme.textMuted, marginBottom: 2 },
  
  taxText: { fontSize: 11, fontWeight: '700', color: Theme.textPrimaryDark, marginBottom: 4 },
  taxLabel: { color: Theme.textMuted, textTransform: 'uppercase' },

  configBlock: { marginBottom: 24 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderLight, borderRadius: 8, padding: 12, marginBottom: 8 },
  toggleText: { flex: 1, paddingRight: 16 },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark },
  toggleSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addChargeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(26,35,126,0.05)', borderRadius: 4 },
  addChargeText: { fontSize: 10, fontWeight: '800', color: Theme.primary, textTransform: 'uppercase' },

  chargeRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderMedium, borderRadius: 8, padding: 12, marginBottom: 8, alignItems: 'center' },
  chargeInput: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark, padding: 0, margin: 0 },
  chargeHint: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', marginTop: 4 },
  chargeAmountInput: { fontSize: 12, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark, backgroundColor: Theme.surfaceGray, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, minWidth: 60, textAlign: 'right' },

  tripsList: { marginBottom: 24 },
  emptyTrips: { padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderLight, borderRadius: 8 },
  emptyTripsText: { fontSize: 12, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  tripItemWrapper: { marginBottom: 12 },
  tripItem: { backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderLight, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripItemTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  tripItemRoute: { fontSize: 10, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase' },
  tripItemAmount: { fontSize: 13, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark },
  addTripChargeText: { fontSize: 9, fontWeight: '800', color: Theme.primary, textTransform: 'uppercase' },

  tripChargeRow: { flexDirection: 'row', backgroundColor: Theme.surfaceGray, borderWidth: 1, borderColor: Theme.borderMedium, borderRadius: 8, padding: 10, marginTop: 4, marginLeft: 24, alignItems: 'center' },

  calcBlock: { backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderLight, borderRadius: 12, padding: 16, marginBottom: 24 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calcLabel: { fontSize: 12, color: Theme.textSecondary, fontWeight: '600' },
  calcVal: { fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark },
  calcSubtotal: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Theme.borderLight, paddingVertical: 8, marginVertical: 8 },
  calcLabelSubtotal: { fontSize: 13, fontWeight: '800', color: Theme.textPrimaryDark },
  calcValSubtotal: { fontSize: 13, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark },
  calcTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8 },
  calcTotalLabel: { fontSize: 16, fontWeight: '800', color: Theme.primary },
  calcTotalVal: { fontSize: 18, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.primary },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  footerBtnOutline: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Theme.borderMedium, alignItems: 'center' },
  footerBtnOutlineText: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  footerBtnPrimary: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Theme.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '800', color: Theme.buttonPrimaryText, textTransform: 'uppercase', letterSpacing: 1 },
  btnDisabled: { opacity: 0.5 },
});
