import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsOnline } from "@/contexts/NetworkContext";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { getTripById } from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { toVerificationSnapshot } from "../selectors/verificationSelectors";
import {
  enqueueVerificationMetadata,
  enqueueVerificationPhoto,
} from "../offline/outbox";
import { uploadVerificationPhoto } from "../uploads/odometerUploads";
import { saveTripVerification } from "../verification.service";
import type { SaveTripVerificationInput } from "../verification.service";

export function useTripVerification(tripId: string | null) {
  return useQuery({
    queryKey: tripId ? queryKeys.trips.verification(tripId) : ["q", "trips", "verification", "noop"],
    queryFn: async () => {
      const res = await getTripById(tripId!);
      if (res.error || !res.trip) throw res.error ?? new Error("Trip not found");
      return toVerificationSnapshot(res.trip);
    },
    enabled: !!tripId,
    staleTime: STALE.realtime,
  });
}

export function useTripVerificationPhotos(
  tripId: string | null,
  opts?: { enabled?: boolean },
) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId
      ? queryKeys.trips.verificationPhotos(tripId)
      : ["q", "trips", "verification", "photos", "noop"],
    queryFn: async () => {
      const { documents, error } = await tripDocumentsService.getDocumentsByTripId(tripId!);
      if (error) throw error;
      return documents.filter(
        (d) =>
          d.document_type === "odometer_start_photo" ||
          d.document_type === "odometer_end_photo",
      );
    },
    enabled,
    staleTime: 60_000,
  });
}

type SaveMutationInput = SaveTripVerificationInput & {
  photoLocalUri?: string | null;
  photoUserId?: string | null;
};

export function useSaveTripVerification() {
  const qc = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation({
    mutationFn: async (input: SaveMutationInput) => {
      const {
        photoLocalUri,
        photoUserId,
        tripId,
        ...verificationInput
      } = input;
      const metadataPayload = {
        tripId,
        side: verificationInput.side,
        odometerKm: verificationInput.odometerKm,
        gpsDistanceKm: verificationInput.gpsDistanceKm ?? null,
        notes: verificationInput.notes ?? null,
        updatedBy: verificationInput.updatedBy,
        markBusinessVerified: verificationInput.markBusinessVerified,
      };

      if (!isOnline) {
        await enqueueVerificationMetadata(metadataPayload);
        if (photoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId ?? null,
          });
        }
        return { queued: true as const };
      }

      const verificationRes = await saveTripVerification({ tripId, ...verificationInput });
      if (verificationRes.error) {
        await enqueueVerificationMetadata(metadataPayload);
        if (photoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId ?? null,
          });
        }
        return { queued: true as const };
      }

      if (photoLocalUri && photoUserId) {
        const uploadRes = await uploadVerificationPhoto({
          tripId,
          side: verificationInput.side,
          localUri: photoLocalUri,
          userId: photoUserId,
        });
        if (uploadRes.error) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId,
          });
        }
      } else if (photoLocalUri && !photoUserId) {
        await enqueueVerificationPhoto({
          tripId,
          side: verificationInput.side,
          localUri: photoLocalUri,
          userId: null,
        });
      }

      return { queued: false as const };
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.detail(input.tripId) });
      qc.invalidateQueries({ queryKey: queryKeys.trips.verification(input.tripId) });
      qc.invalidateQueries({
        queryKey: queryKeys.trips.verificationPhotos(input.tripId),
      });
    },
  });
}
