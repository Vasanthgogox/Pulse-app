import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { Pressable, ScrollView, Text, View } from "react-native";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";

const WIZARD_CLIENT_AVATAR_SIZE = 30;

export interface WizardClientPickerProps {
  clients: ClientRow[];
  loading?: boolean;
  selectedClientId: string | null;
  onSelect: (client: ClientRow) => void;
  onAddClient?: () => void;
  emptyMessage?: string;
  listMaxHeight?: number;
}

export function WizardClientPicker({
  clients,
  loading = false,
  selectedClientId,
  onSelect,
  onAddClient,
  emptyMessage = "No clients yet. Add a client to continue.",
  listMaxHeight = 320,
}: WizardClientPickerProps) {
  if (loading) {
    return (
      <View style={styles.clientLoadingWrap}>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  if (clients.length === 0) {
    return (
      <View style={styles.shipperWarningCard}>
        <Text style={styles.shipperWarningText}>{emptyMessage}</Text>
        {onAddClient ? (
          <Pressable style={styles.addClientBtn} onPress={onAddClient}>
            <Text style={styles.addClientBtnText}>+ Add client</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.clientListWrap}>
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: listMaxHeight }}
        >
          {clients.map((client) => {
            const selected = selectedClientId === client.id;
            const name = client.name ?? client.contact_person ?? "Client";
            return (
              <Pressable
                key={client.id}
                style={[styles.clientRow, selected && styles.clientRowSelected]}
                onPress={() => onSelect(client)}
              >
                <PartyAvatar
                  name={name}
                  avatarUrl={client.avatar_url ?? null}
                  avatarSeed={client.avatar_seed ?? null}
                  entityType="client"
                  size={WIZARD_CLIENT_AVATAR_SIZE}
                  shape="rounded"
                />
                <View style={styles.partyTextWrap}>
                  <Text style={styles.partyName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.blockMeta} numberOfLines={1}>
                    {client.phone?.trim() || client.address?.trim() || "—"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {onAddClient ? (
        <Pressable style={styles.addClientBtn} onPress={onAddClient}>
          <Text style={styles.addClientBtnText}>+ Add new client</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WizardClientSummaryCard({
  name,
  subtitle,
  avatarUrl,
  avatarSeed,
  label = "Client",
  onPress,
}: {
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  label?: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.shipperMarkCard}>
      <PartyAvatar
        name={name}
        avatarUrl={avatarUrl ?? null}
        avatarSeed={avatarSeed ?? null}
        entityType="client"
        size={WIZARD_CLIENT_AVATAR_SIZE}
        shape="rounded"
      />
      <View style={styles.partyTextWrap}>
        <Text style={styles.partyLabel}>{label}</Text>
        <Text style={styles.partyName} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.blockMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
