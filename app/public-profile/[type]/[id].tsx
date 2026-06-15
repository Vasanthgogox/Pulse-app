import { useLocalSearchParams } from "expo-router";

import PublicProfileScreen from "@/features/public-profile/components/PublicProfileScreen";
import { usePublicProfileEntity } from "@/features/public-profile/hooks/usePublicProfileEntity";
import type { PublicProfileEntityType } from "@/features/public-profile/types";
import { useSafeBack } from "@/lib/useSafeBack";

type ParamShape = { type?: string | string[]; id?: string | string[] };

const VALID_TYPES: PublicProfileEntityType[] = ["client", "supplier", "driver"];

function pickParam(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return "";
}

export default function PublicProfileRoute() {
  const { type, id } = useLocalSearchParams<ParamShape>();
  const safeBack = useSafeBack();

  const entityType = pickParam(type) as PublicProfileEntityType;
  const entityId = pickParam(id);
  const isValidType = VALID_TYPES.includes(entityType);

  const { entity, loading, errorMessage } = usePublicProfileEntity(
    isValidType ? entityType : null,
    entityId || null,
  );

  const resolvedError =
    !isValidType || !entityId
      ? "Unknown entity type or missing id."
      : errorMessage;

  return (
    <PublicProfileScreen
      entity={entity}
      loading={loading}
      errorMessage={resolvedError}
      onBack={safeBack}
    />
  );
}
