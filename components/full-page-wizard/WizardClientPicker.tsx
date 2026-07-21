import { useMemo } from "react";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fullPageWizardStyles as styles, WIZARD_PARTY_AVATAR_SIZE, WIZARD_PARTY_GRID_COLUMNS } from "./fullPageWizardStyles";
import { WizardEntityPartyCell } from "./WizardEntityPartyCell";
import { WizardSelectionGrid } from "./WizardSelectionGrid";

export interface WizardClientPickerProps {
  clients: ClientRow[];
  loading?: boolean;
  selectedClientId: string | null;
  onSelect: (client: ClientRow) => void;
  onAddClient?: () => void;
  emptyMessage?: string;
  listMaxHeight?: number;
  /** Default: {@link WIZARD_PARTY_GRID_COLUMNS}. Use `1` for full-width party tiles. */
  columns?: number;
  addClientAlign?: "start" | "center" | "stretch";
  showListShell?: boolean;
}

function sortClientsByName(clients: ClientRow[]): ClientRow[] {
  return [...clients].sort((a, b) =>
    (a.name ?? a.contact_person ?? "").localeCompare(
      b.name ?? b.contact_person ?? "",
      "en",
      { sensitivity: "base" },
    ),
  );
}

export function WizardClientPicker({
  clients,
  loading = false,
  selectedClientId,
  onSelect,
  onAddClient,
  emptyMessage = "No clients yet. Add a client to continue.",
  listMaxHeight = 420,
  columns = WIZARD_PARTY_GRID_COLUMNS,
  addClientAlign = "stretch",
  showListShell = true,
}: WizardClientPickerProps) {
  const sortedClients = useMemo(() => sortClientsByName(clients), [clients]);

  const gridItems = useMemo(
    () =>
      sortedClients.map((client) => {
        const name = client.name ?? client.contact_person ?? "Client";
        return {
          id: client.id,
          name,
          subtitle: resolveWizardClientPhone(client.phone),
          avatarUrl: client.avatar_url ?? null,
          avatarSeed: client.avatar_seed ?? null,
          entityType: "client" as const,
        };
      }),
    [sortedClients],
  );

  return (
    <View style={pickerStyles.root}>
      <View style={pickerStyles.gridArea}>
        <WizardSelectionGrid
          items={gridItems}
          selectedId={selectedClientId}
          onSelect={(id) => {
            const client = sortedClients.find((c) => c.id === id);
            if (client) onSelect(client);
          }}
          loading={loading}
          emptyMessage={emptyMessage}
          listMaxHeight={listMaxHeight}
          variant="partyCard"
          columns={columns}
          showListShell={showListShell}
        />
      </View>
      {onAddClient ? (
        <Pressable
          style={[
            styles.addClientBtn,
            styles.addClientBtnFlat,
            addClientAlign === "start" && pickerStyles.addClientStart,
            addClientAlign === "center" && pickerStyles.addClientCenter,
          ]}
          onPress={onAddClient}
        >
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
  return (
    <WizardEntityPartyCell
      label={label}
      name={name}
      subtitle={subtitle}
      entityType="client"
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      avatarSize={WIZARD_PARTY_AVATAR_SIZE}
      onPress={onPress}
    />
  );
}

const pickerStyles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
    gap: 8,
  },
  gridArea: {
    width: "100%",
    minHeight: 0,
    alignSelf: "stretch",
  },
  addClientStart: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    minHeight: 36,
    paddingHorizontal: 0,
  },
  addClientCenter: {
    alignSelf: "center",
  },
});
