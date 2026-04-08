import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useExecuteInvoiceMutation, useInvoicingExecuteTripsQuery } from '@/lib/queries/useInvoicingExecuteQueries';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { AdditionalCharge, InvoiceConfig, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { getInvoiceBrandingSettings } from '@/features/invoicing/services/invoiceBranding.service';
import { useInvoiceCalc } from '@/features/invoicing/hooks/useInvoiceCalc';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useAuth } from '@/contexts/AuthContext';
import { getCapabilitiesFromProfile } from '@/lib/capabilities';
import type { InvoicePdfData } from '@/components/InvoicePdf.types';

import InvoicePdf from '@/components/InvoicePdf';

interface InvoicePreviewParams extends Record<string, string | undefined> {
  activeClient: string;
  selectedTripIds: string;
  paymentTerms: string;
  notes: string;
  includeGst: string;
  gstRate: string;
  includeFuel: string;
  fuelRate: string;
  additionalCharges: string;
}

function canAccessInvoicing(profile: ReturnType<typeof useAuth>['profile']): boolean {
  if (!profile || profile.role === 'driver') return false;
  const caps = getCapabilitiesFromProfile(profile);
  return (
    caps.includes('finance_view') ||
    caps.includes('finance_manage') ||
    caps.includes('dispatch') ||
    caps.includes('dispatch_for_own_fleet')
  );
}

function safeJsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function parseNetDays(paymentTerms: string): number {
  const m = paymentTerms.match(/(\d+)/);
  return m ? Number(m[1]) : 30;
}

function buildInvoiceNo(selectedTrips: InvoicingTripView[]): string {
  const d = new Date();
  const datePart = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const seed = (selectedTrips[0]?.id || '0000').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  return 'INV-' + datePart + '-' + (seed || 'DRAFT');
}

export default function InvoicePdfPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams() as InvoicePreviewParams;
  const { profile } = useAuth();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [brandingName, setBrandingName] = useState('GOGOX');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);

  const activeClient = params.activeClient || '';
  const paymentTerms = params.paymentTerms || 'Net 30';
  const notes = params.notes || '';

  const parsedIncludeGst = params.includeGst === 'true';
  const parsedGstRate = Number.parseFloat(params.gstRate || '0') || 0;
  const parsedIncludeFuel = params.includeFuel === 'true';
  const parsedFuelRate = Number.parseFloat(params.fuelRate || '0') || 0;
  const parsedAdditionalCharges = safeJsonArray<AdditionalCharge>(params.additionalCharges);
  const parsedSelectedTripIds = safeJsonArray<string>(params.selectedTripIds);

  const { data: allTrips = [], isLoading: isLoadingTrips, isError: isErrorTrips, error: errorTrips } = useInvoicingExecuteTripsQuery(orgId);
  const executeMutation = useExecuteInvoiceMutation(orgId);

  const tripsById = useMemo(() => {
    const map = new Map<string, InvoicingTripView>();
    for (const t of allTrips) map.set(t.id, t);
    return map;
  }, [allTrips]);

  const selectedTrips: InvoicingTripView[] = useMemo(
    () => parsedSelectedTripIds.map((id) => tripsById.get(id)).filter(Boolean) as InvoicingTripView[],
    [parsedSelectedTripIds, tripsById],
  );
  const previewInvoiceNo = useMemo(() => buildInvoiceNo(selectedTrips), [selectedTrips]);

  const invoiceConfig: InvoiceConfig = {
    includeGst: parsedIncludeGst,
    gstRate: parsedGstRate,
    includeFuel: parsedIncludeFuel,
    fuelRate: parsedFuelRate,
    additionalCharges: parsedAdditionalCharges,
  };

  const calculations = useInvoiceCalc(selectedTrips, invoiceConfig);
  const allowed = canAccessInvoicing(profile);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { settings } = await getInvoiceBrandingSettings();
      if (!mounted) return;
      setBrandingName(settings.companyName);
      setBrandingLogoUrl(settings.logoUrl);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const invoiceData: InvoicePdfData = useMemo(() => {
    const issued = new Date();
    const due = addDays(issued, parseNetDays(paymentTerms));
    const lrScope = selectedTrips.slice(0, 6).map((t) => t.id).join(', ') || 'N/A';

    return {
      brandingCompanyName: brandingName,
      brandingLogoUrl,
      invoiceNo: previewInvoiceNo,
      clientName: activeClient || 'Unknown Client',
      issuedOn: formatDate(issued),
      dueOn: formatDate(due),
      billingAddressLines: [
        activeClient || 'Client Accounts',
        'Central Processing Tower',
        'Business District, Area 51',
      ],
      shipmentTargetLines: [
        'Main Production Facility',
        'Industrial Hub, Block 4',
        'Manufacturing Zone',
      ],
      paymentTerms,
      notes,
      lrScope,
      assetFleet: Array.from(new Set(selectedTrips.map((t) => t.details || 'N/A'))).join(', '),
      bankDetailsLines: [
        'HDFC BANK | IFSC: HDFC0001234',
        'A/C: 50200012345678 | BRANCH: CHENNAI',
      ],
      items: selectedTrips.map((trip) => ({
        tripId: trip.id,
        route: trip.route,
        context: trip.details || 'Vehicle Context N/A',
        date: formatDate(trip.date),
        amount: trip.amount,
      })),
      additionalCharges: parsedAdditionalCharges.map((c) => ({
        description: c.description || 'Additional charge',
        amount: Number(c.amount || 0),
      })),
      subtotal: calculations.subtotal,
      taxLabel: parsedIncludeGst ? 'Tax (GST ' + parsedGstRate + '%)' : 'Tax (GST 0%)',
      taxAmount: calculations.sgst + calculations.cgst,
      grandTotal: calculations.totalAmount,
    };
  }, [activeClient, brandingLogoUrl, brandingName, calculations.cgst, calculations.sgst, calculations.subtotal, calculations.totalAmount, notes, parsedAdditionalCharges, parsedGstRate, parsedIncludeGst, paymentTerms, previewInvoiceNo, selectedTrips]);

  const handleFinalizeAndSend = useCallback(async () => {
    setIsFinalizing(true);
    try {
      if (!orgId) {
        Alert.alert('Error', 'Organization not loaded. Cannot finalize invoice.');
        return;
      }
      const internalIds = selectedTrips.map((t) => t.internal_id);
      await executeMutation.mutateAsync({
        internalIds,
        payload: {
          invoiceNo: previewInvoiceNo,
          notes,
          paymentTerms,
          includeGst: parsedIncludeGst,
          gstRate: parsedGstRate,
          includeFuel: parsedIncludeFuel,
          fuelRate: parsedFuelRate,
          additionalCharges: parsedAdditionalCharges,
          calculations,
        },
      });
      Alert.alert('Success', 'Invoice issued successfully.');
      router.back();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to issue invoice.');
    } finally {
      setIsFinalizing(false);
    }
  }, [orgId, selectedTrips, executeMutation, previewInvoiceNo, notes, paymentTerms, parsedIncludeGst, parsedGstRate, parsedIncludeFuel, parsedFuelRate, parsedAdditionalCharges, calculations, router]);

  if (!allowed) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>Your account does not have access to execute invoices.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || isLoadingTrips || !orgId) {
    return <CenteredLoadingView message={orgLoading ? 'Loading organization...' : (isLoadingTrips ? 'Loading trips...' : 'Initializing...')} />;
  }

  if (isErrorTrips) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Could not load trips</Text>
        <Text style={styles.blockedBody}>{errorTrips instanceof Error ? errorTrips.message : 'Unknown error'}</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (selectedTrips.length === 0) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>No trips selected</Text>
        <Text style={styles.blockedBody}>Please select at least one approved trip to generate an invoice preview.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}> 
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name='arrow-left' size={16} color={Theme.textPrimaryDark} />
          <Text style={styles.backButtonText}>Invoice Preview</Text>
        </Pressable>
      </View>

      <InvoicePdf invoiceData={invoiceData} onFinalize={handleFinalizeAndSend} isFinalizing={isFinalizing} />
    </View>
  );
}

const styles = StyleSheet.create({
  blocked: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  blockedBody: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginBottom: 20,
  },
  blockedBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  blockedBtnText: {
    color: Theme.buttonPrimaryText,
    fontWeight: '700',
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginLeft: 8,
  },
});
