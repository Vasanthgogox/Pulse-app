import { useEffect } from "react";

import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";

import { useTripVerificationPhotos } from "../queries/useTripVerification";

type Side = "start" | "end";

type Options = {
  tripId: string;
  setStartPhotoUri: (uri: string | null) => void;
  setEndPhotoUri: (uri: string | null) => void;
  /** Skip hydration when user already attached a local photo this session. */
  startHasLocalPhoto?: boolean;
  endHasLocalPhoto?: boolean;
};

/** Load saved odometer photos from trip documents into preview URIs. */
export function useHydrateOdometerPhotos({
  tripId,
  setStartPhotoUri,
  setEndPhotoUri,
  startHasLocalPhoto = false,
  endHasLocalPhoto = false,
}: Options) {
  const photosQuery = useTripVerificationPhotos(tripId);

  useEffect(() => {
    const docs = photosQuery.data;
    if (!docs?.length) return;

    const hydrateSide = async (side: Side, hasLocal: boolean, setUri: (uri: string | null) => void) => {
      if (hasLocal) return;
      const type = side === "start" ? "odometer_start_photo" : "odometer_end_photo";
      const doc = docs.find((d) => d.document_type === type);
      if (!doc?.storage_path) return;
      const url = await tripDocumentsService.getDocumentViewUrl(doc.storage_path);
      if (url) setUri(url);
    };

    void Promise.all([
      hydrateSide("start", startHasLocalPhoto, setStartPhotoUri),
      hydrateSide("end", endHasLocalPhoto, setEndPhotoUri),
    ]);
  }, [
    endHasLocalPhoto,
    photosQuery.data,
    setEndPhotoUri,
    setStartPhotoUri,
    startHasLocalPhoto,
  ]);
}
