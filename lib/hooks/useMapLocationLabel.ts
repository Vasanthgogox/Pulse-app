import {
  MAP_LOCATION_LABEL_LOADING,
  MAP_LOCATION_LABEL_UNKNOWN,
  resolveMapLocationLabel,
  type MapLocationLabelMode,
} from '@/lib/mapLocationLabel.service';
import { useEffect, useState } from 'react';

type Options = {
  mode?: MapLocationLabelMode;
  enabled?: boolean;
};

/**
 * Resolves coordinates to a human-readable label for tracking cards / HUD.
 */
export function useMapLocationLabel(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  options?: Options,
): {
  label: string | null;
  loading: boolean;
  displayLine: string;
} {
  const mode = options?.mode ?? 'full';
  const enabled = options?.enabled !== false;
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLabel(null);
      setLoading(false);
      return;
    }
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      setLabel(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void resolveMapLocationLabel(latitude, longitude, { mode }).then((resolved) => {
        if (!active) return;
        setLabel(resolved);
        setLoading(false);
      });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [latitude, longitude, mode, enabled]);

  const displayLine = loading
    ? MAP_LOCATION_LABEL_LOADING
    : label?.trim() || MAP_LOCATION_LABEL_UNKNOWN;

  return { label, loading, displayLine };
}
