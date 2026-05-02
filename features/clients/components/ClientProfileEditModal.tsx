/**
 * ClientProfileEditModal — 3-tab edit sidebar for client profile.
 * Tabs: BASIC INFORMATION | OPERATIONS HUBS | ROUTE CONTRACTS
 */
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClientRow, UpdateClientData } from '../services/clients.service';
import { updateClient } from '../services/clients.service';
import type { ClientContract, UpdateContractData } from '../services/clientContracts.service';
import {
  createContract,
  deleteContract,
  updateContract,
} from '../services/clientContracts.service';
import type { ClientWarehouse, UpdateWarehouseData } from '../services/clientWarehouses.service';
import {
  createWarehouse,
  deleteWarehouse,
  updateWarehouse,
} from '../services/clientWarehouses.service';

const INDIGO = '#3730a3';

type Tab = 'BASIC' | 'HUBS' | 'CONTRACTS';

const RATE_TYPES: Array<{ value: ClientContract['rate_type']; label: string }> = [
  { value: 'per_trip', label: 'PER TRIP' },
  { value: 'per_ton', label: 'PER TON' },
  { value: 'per_kg', label: 'PER KG' },
  { value: 'per_km', label: 'PER KM' },
  { value: 'fixed', label: 'FIXED' },
];

export interface ClientProfileEditModalProps {
  visible: boolean;
  client: ClientRow;
  warehouses: ClientWarehouse[];
  contracts: ClientContract[];
  organizationId: string;
  onClose: () => void;
  onWarehousesChange: (warehouses: ClientWarehouse[]) => void;
  onContractsChange: (contracts: ClientContract[]) => void;
}

export function ClientProfileEditModal({
  visible,
  client,
  warehouses,
  contracts,
  organizationId,
  onClose,
  onWarehousesChange,
  onContractsChange,
}: ClientProfileEditModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && windowWidth >= 700;
  const [activeTab, setActiveTab] = useState<Tab>('BASIC');

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }> = [
    { id: 'BASIC', label: 'BASIC INFORMATION', icon: 'id-card-o' },
    { id: 'HUBS', label: 'OPERATIONS HUBS', icon: 'building-o' },
    { id: 'CONTRACTS', label: 'ROUTE CONTRACTS', icon: 'file-text-o' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>EDIT PROFILE</Text>
            <Text style={styles.headerSub}>
              {(client.name || client.contact_person || '').trim() || 'Client'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityLabel="Close edit modal"
          >
            <FontAwesome name="times" size={18} color={Theme.textOnPrimary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.body, isWide && styles.bodyWide]}>
          {/* Sidebar tabs */}
          <View style={[styles.sidebar, isWide && styles.sidebarWide]}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabItem, active && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.8}
                >
                  <FontAwesome
                    name={tab.icon}
                    size={14}
                    color={active ? INDIGO : Theme.textMuted}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {active && <View style={styles.tabActiveDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Panel content */}
          <View style={styles.panel}>
            {activeTab === 'BASIC' && (
              <BasicInfoPanel
                client={client}
                organizationId={organizationId}
              />
            )}
            {activeTab === 'HUBS' && (
              <HubsPanel
                warehouses={warehouses}
                organizationId={organizationId}
                clientId={client.id}
                onWarehousesChange={onWarehousesChange}
              />
            )}
            {activeTab === 'CONTRACTS' && (
              <ContractsPanel
                contracts={contracts}
                warehouses={warehouses}
                organizationId={organizationId}
                clientId={client.id}
                onContractsChange={onContractsChange}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Basic Info Panel ----

function BasicInfoPanel({
  client,
  organizationId,
}: {
  client: ClientRow;
  organizationId: string;
}) {
  const [gstin, setGstin] = useState(client.gstin ?? '');
  const [pan, setPan] = useState(client.pan_number ?? '');
  const [billingAddress, setBillingAddress] = useState(client.address ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const patch: UpdateClientData = {
      gstin: gstin.trim() || undefined,
      pan_number: pan.trim() || undefined,
      address: billingAddress.trim() || undefined,
    };
    const { error } = await updateClient(organizationId, client.id, patch);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      Alert.alert('Saved', 'Client details updated.');
    }
  };

  return (
    <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Basic Information</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Legal Name</Text>
        <View style={styles.readonlyField}>
          <Text style={styles.readonlyText}>
            {(client.name || client.contact_person || '').trim() || '—'}
          </Text>
        </View>
        <Text style={styles.fieldHint}>Legal name is managed via the client record.</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>GSTIN</Text>
        <TextInput
          style={styles.input}
          value={gstin}
          onChangeText={setGstin}
          placeholder="e.g. 27AAAAA0000A1Z5"
          placeholderTextColor={Theme.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>PAN</Text>
        <TextInput
          style={styles.input}
          value={pan}
          onChangeText={setPan}
          placeholder="e.g. AAAAA0000A"
          placeholderTextColor={Theme.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Billing HQ Address</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={billingAddress}
          onChangeText={setBillingAddress}
          placeholder="Full billing address"
          placeholderTextColor={Theme.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---- Hubs Panel ----

type HubDraft = UpdateWarehouseData & { _tempId?: string };

function HubsPanel({
  warehouses: initialWarehouses,
  organizationId,
  clientId,
  onWarehousesChange,
}: {
  warehouses: ClientWarehouse[];
  organizationId: string;
  clientId: string;
  onWarehousesChange: (warehouses: ClientWarehouse[]) => void;
}) {
  const [warehouses, setWarehouses] = useState<ClientWarehouse[]>(initialWarehouses);
  const [addingHub, setAddingHub] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HubDraft>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft({});
    setAddingHub(false);
    setEditingId(null);
  };

  const handleSaveHub = async () => {
    if (!(draft.name ?? '').trim()) {
      Alert.alert('Validation', 'Hub name is required.');
      return;
    }
    setSaving(true);
    if (editingId) {
      const { error } = await updateWarehouse(editingId, draft);
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const updated = warehouses.map((w) =>
          w.id === editingId ? { ...w, ...draft } : w,
        );
        setWarehouses(updated);
        onWarehousesChange(updated);
        resetDraft();
      }
    } else {
      const { error, warehouse } = await createWarehouse(organizationId, clientId, draft);
      if (error || !warehouse) {
        Alert.alert('Error', error?.message ?? 'Failed to create hub');
      } else {
        const updated = [...warehouses, warehouse];
        setWarehouses(updated);
        onWarehousesChange(updated);
        resetDraft();
      }
    }
    setSaving(false);
  };

  const handleDeleteHub = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteWarehouse(id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const updated = warehouses.filter((w) => w.id !== id);
      setWarehouses(updated);
      onWarehousesChange(updated);
    }
    setDeletingId(null);
  };

  const startEdit = (wh: ClientWarehouse) => {
    setEditingId(wh.id);
    setDraft({
      name: wh.name,
      address: wh.address ?? '',
      city: wh.city ?? '',
      state: wh.state ?? '',
      local_gstin: wh.local_gstin ?? '',
      contact_name: wh.contact_name ?? '',
      contact_phone: wh.contact_phone ?? '',
    });
    setAddingHub(false);
  };

  const showForm = addingHub || editingId != null;

  return (
    <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelContent}>
      <View style={styles.panelTitleRow}>
        <Text style={styles.panelTitle}>Operations Hubs</Text>
        {!showForm && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setAddingHub(true); setDraft({}); setEditingId(null); }}
            activeOpacity={0.85}
          >
            <FontAwesome name="plus" size={12} color={INDIGO} />
            <Text style={styles.addBtnText}>Register Hub</Text>
          </TouchableOpacity>
        )}
      </View>

      {warehouses.map((wh) => (
        <View key={wh.id} style={styles.hubRow}>
          <View style={styles.hubRowInfo}>
            <Text style={styles.hubRowName} numberOfLines={1}>{wh.name}</Text>
            <Text style={styles.hubRowSub} numberOfLines={1}>
              {[wh.city, wh.state].filter(Boolean).join(', ') || wh.address || '—'}
            </Text>
          </View>
          <View style={styles.hubRowActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => startEdit(wh)}
              activeOpacity={0.8}
            >
              <FontAwesome name="pencil" size={13} color={Theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() =>
                Alert.alert('Delete hub', `Remove "${wh.name}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => handleDeleteHub(wh.id) },
                ])
              }
              activeOpacity={0.8}
              disabled={deletingId === wh.id}
            >
              {deletingId === wh.id ? (
                <ActivityIndicator size="small" color={Theme.negative} />
              ) : (
                <FontAwesome name="trash-o" size={13} color={Theme.negative} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {warehouses.length === 0 && !showForm && (
        <Text style={styles.emptyHint}>No hubs registered. Tap "+ Register Hub" to add one.</Text>
      )}

      {showForm && (
        <View style={styles.hubForm}>
          <Text style={styles.hubFormTitle}>
            {editingId ? 'Edit Hub' : 'New Hub'}
          </Text>
          <InlineField
            label="Hub Name *"
            value={draft.name ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="e.g. Mumbai Warehouse"
          />
          <InlineField
            label="Address"
            value={draft.address ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, address: v }))}
            placeholder="Street address"
          />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <InlineField
                label="City"
                value={draft.city ?? ''}
                onChangeText={(v) => setDraft((d) => ({ ...d, city: v }))}
                placeholder="City"
              />
            </View>
            <View style={styles.fieldHalf}>
              <InlineField
                label="State"
                value={draft.state ?? ''}
                onChangeText={(v) => setDraft((d) => ({ ...d, state: v }))}
                placeholder="State"
              />
            </View>
          </View>
          <InlineField
            label="Local GSTIN"
            value={draft.local_gstin ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, local_gstin: v }))}
            placeholder="GST number for this hub"
            autoCapitalize="characters"
            maxLength={15}
          />
          <InlineField
            label="Contact Person"
            value={draft.contact_name ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, contact_name: v }))}
            placeholder="Name"
          />
          <InlineField
            label="Contact Phone"
            value={draft.contact_phone ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, contact_phone: v }))}
            placeholder="+91 XXXXX XXXXX"
            keyboardType="phone-pad"
          />
          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={resetDraft}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1 }, saving && styles.saveBtnDisabled]}
              onPress={handleSaveHub}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? 'UPDATE HUB' : 'SAVE HUB'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ---- Contracts Panel ----

type ContractDraft = Partial<{
  pickup_area: string;
  drop_location: string;
  rate: string;
  rate_type: ClientContract['rate_type'];
  valid_from: string;
  valid_to: string;
  warehouse_id: string | null;
  billing_to_hq: boolean;
  notes: string;
}>;

function ContractsPanel({
  contracts: initialContracts,
  warehouses,
  organizationId,
  clientId,
  onContractsChange,
}: {
  contracts: ClientContract[];
  warehouses: ClientWarehouse[];
  organizationId: string;
  clientId: string;
  onContractsChange: (contracts: ClientContract[]) => void;
}) {
  const [contracts, setContracts] = useState<ClientContract[]>(initialContracts);
  const [addingLane, setAddingLane] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContractDraft>({ rate_type: 'per_trip' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft({ rate_type: 'per_trip' });
    setAddingLane(false);
    setEditingId(null);
  };

  const handleSaveLane = async () => {
    if (!(draft.pickup_area ?? '').trim() || !(draft.drop_location ?? '').trim()) {
      Alert.alert('Validation', 'Pickup area and drop location are required.');
      return;
    }
    setSaving(true);
    const payload: UpdateContractData = {
      pickup_area: draft.pickup_area?.trim(),
      drop_location: draft.drop_location?.trim(),
      rate: draft.rate ? Number(draft.rate) : null,
      rate_type: draft.rate_type ?? 'per_trip',
      valid_from: draft.valid_from?.trim() || null,
      valid_to: draft.valid_to?.trim() || null,
      warehouse_id: draft.warehouse_id ?? null,
      billing_to_hq: draft.billing_to_hq ?? true,
      notes: draft.notes?.trim() || null,
    };

    if (editingId) {
      const { error } = await updateContract(editingId, payload);
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const updated = contracts.map((c) =>
          c.id === editingId ? { ...c, ...payload } : c,
        );
        setContracts(updated);
        onContractsChange(updated);
        resetDraft();
      }
    } else {
      const { error, contract } = await createContract(organizationId, clientId, payload);
      if (error || !contract) {
        Alert.alert('Error', error?.message ?? 'Failed to create lane');
      } else {
        const updated = [...contracts, contract];
        setContracts(updated);
        onContractsChange(updated);
        resetDraft();
      }
    }
    setSaving(false);
  };

  const handleDeleteLane = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteContract(id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const updated = contracts.filter((c) => c.id !== id);
      setContracts(updated);
      onContractsChange(updated);
    }
    setDeletingId(null);
  };

  const startEdit = (c: ClientContract) => {
    setEditingId(c.id);
    setDraft({
      pickup_area: c.pickup_area,
      drop_location: c.drop_location,
      rate: c.rate != null ? String(c.rate) : '',
      rate_type: c.rate_type,
      valid_from: c.valid_from ?? '',
      valid_to: c.valid_to ?? '',
      warehouse_id: c.warehouse_id,
      billing_to_hq: c.billing_to_hq,
      notes: c.notes ?? '',
    });
    setAddingLane(false);
  };

  const showForm = addingLane || editingId != null;

  return (
    <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelContent}>
      <View style={styles.panelTitleRow}>
        <Text style={styles.panelTitle}>Route Contracts</Text>
        {!showForm && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setAddingLane(true); setDraft({ rate_type: 'per_trip' }); setEditingId(null); }}
            activeOpacity={0.85}
          >
            <FontAwesome name="plus" size={12} color={INDIGO} />
            <Text style={styles.addBtnText}>Define Lane</Text>
          </TouchableOpacity>
        )}
      </View>

      {contracts.map((c) => (
        <View key={c.id} style={styles.contractRow}>
          <View style={styles.contractRowInfo}>
            <Text style={styles.contractRouteText} numberOfLines={1}>
              {c.pickup_area} → {c.drop_location}
            </Text>
            <Text style={styles.contractRateText}>
              {c.rate != null ? `₹${c.rate.toLocaleString('en-IN')}` : 'No rate'} · {c.rate_type.replace('_', '/')}
            </Text>
          </View>
          <View style={styles.hubRowActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => startEdit(c)} activeOpacity={0.8}>
              <FontAwesome name="pencil" size={13} color={Theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() =>
                Alert.alert('Delete lane', `Remove this lane contract?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => handleDeleteLane(c.id) },
                ])
              }
              disabled={deletingId === c.id}
              activeOpacity={0.8}
            >
              {deletingId === c.id ? (
                <ActivityIndicator size="small" color={Theme.negative} />
              ) : (
                <FontAwesome name="trash-o" size={13} color={Theme.negative} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {contracts.length === 0 && !showForm && (
        <Text style={styles.emptyHint}>No lane contracts. Tap "+ Define Lane" to add one.</Text>
      )}

      {showForm && (
        <View style={styles.hubForm}>
          <Text style={styles.hubFormTitle}>{editingId ? 'Edit Lane' : 'New Lane Contract'}</Text>

          {warehouses.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Pickup Hub (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                <TouchableOpacity
                  style={[styles.hubChip, !draft.warehouse_id && styles.hubChipSelected]}
                  onPress={() => setDraft((d) => ({ ...d, warehouse_id: null }))}
                >
                  <Text style={[styles.hubChipText, !draft.warehouse_id && styles.hubChipTextSelected]}>
                    Custom
                  </Text>
                </TouchableOpacity>
                {warehouses.map((wh) => (
                  <TouchableOpacity
                    key={wh.id}
                    style={[styles.hubChip, draft.warehouse_id === wh.id && styles.hubChipSelected]}
                    onPress={() => setDraft((d) => ({ ...d, warehouse_id: wh.id, pickup_area: wh.name }))}
                  >
                    <Text style={[styles.hubChipText, draft.warehouse_id === wh.id && styles.hubChipTextSelected]}>
                      {wh.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <InlineField
            label="Pickup Area *"
            value={draft.pickup_area ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, pickup_area: v }))}
            placeholder="e.g. Mumbai, MH"
          />
          <InlineField
            label="Drop Location *"
            value={draft.drop_location ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, drop_location: v }))}
            placeholder="e.g. Amritsar, PB"
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Rate Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {RATE_TYPES.map((rt) => (
                <TouchableOpacity
                  key={rt.value}
                  style={[styles.hubChip, draft.rate_type === rt.value && styles.hubChipSelected]}
                  onPress={() => setDraft((d) => ({ ...d, rate_type: rt.value }))}
                >
                  <Text style={[styles.hubChipText, draft.rate_type === rt.value && styles.hubChipTextSelected]}>
                    {rt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <InlineField
            label="Rate (₹)"
            value={draft.rate ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, rate: v }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <InlineField
                label="Valid From"
                value={draft.valid_from ?? ''}
                onChangeText={(v) => setDraft((d) => ({ ...d, valid_from: v }))}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.fieldHalf}>
              <InlineField
                label="Valid To"
                value={draft.valid_to ?? ''}
                onChangeText={(v) => setDraft((d) => ({ ...d, valid_to: v }))}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <InlineField
            label="Notes"
            value={draft.notes ?? ''}
            onChangeText={(v) => setDraft((d) => ({ ...d, notes: v }))}
            placeholder="Optional notes about this lane"
          />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetDraft} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1 }, saving && styles.saveBtnDisabled]}
              onPress={handleSaveLane}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? 'UPDATE LANE' : 'SAVE LANE'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ---- Inline Field helper ----

function InlineField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.placeholder}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Theme.textOnPrimary,
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'column',
  },
  bodyWide: {
    flexDirection: 'row',
  },
  sidebar: {
    flexDirection: 'row',
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  sidebarWide: {
    flexDirection: 'column',
    width: 200,
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: Theme.surfaceBorder,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: INDIGO + '0e',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: INDIGO,
  },
  tabActiveDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: INDIGO,
  },
  panel: {
    flex: 1,
  },
  panelScroll: {
    flex: 1,
  },
  panelContent: {
    padding: 16,
    paddingBottom: 40,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 16,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  fieldHint: {
    fontSize: 11,
    color: Theme.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  readonlyField: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readonlyText: {
    fontSize: 14,
    color: Theme.textSecondary,
  },
  input: {
    backgroundColor: Theme.surfaceForm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: INDIGO,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.borderInput,
    marginTop: 8,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: INDIGO + '12',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: INDIGO + '30',
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: INDIGO,
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  hubRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  hubRowName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  hubRowSub: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  hubRowActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  contractRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  contractRouteText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  contractRateText: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  hubForm: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 14,
    marginTop: 8,
  },
  hubFormTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 14,
  },
  emptyHint: {
    fontSize: 12,
    color: Theme.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  chipScroll: {
    flexDirection: 'row',
  },
  hubChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
    marginRight: 6,
  },
  hubChipSelected: {
    backgroundColor: INDIGO + '14',
    borderColor: INDIGO + '50',
  },
  hubChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  hubChipTextSelected: {
    color: INDIGO,
    fontWeight: '700',
  },
});
