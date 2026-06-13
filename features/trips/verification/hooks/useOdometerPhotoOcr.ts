import { useCallback, useEffect, useRef, useState } from "react";

import { captureOrPickImage } from "@/lib/media/captureImage.util";

import {
  buildOdometerScanCompleteState,
  buildOdometerScanConfirmState,
  normalizeOdometerRaw,
  odometerReadingsEquivalent,
  reconcileOdometerScanWithReading,
} from "../applyOdometerScan.util";
import {
  extractOdometerPhotoOcr,
  formatOdometerKmForEntry,
} from "../odometerPhotoOcr.service";
import {
  ODOMETER_SCAN_IDLE,
  ODOMETER_SCAN_MESSAGES,
  type OdometerScanState,
} from "../odometerScan.types";

const MIN_APPLY_CONFIDENCE = 0.2;
const MIN_CONFIRM_CONFIDENCE = 0.12;

type Options = {
  permissionMessage?: string;
  /** Latest keypad reading — avoids stale closure during async OCR. */
  getCurrentRaw: () => string;
  /** Pass live keypad value so Apply re-enables when user edits away from OCR. */
  currentRaw?: string;
  onKmApplied: (rawKm: string) => void;
};

export function useOdometerPhotoOcr({
  permissionMessage = "Enable camera or photo library access to photograph the odometer.",
  getCurrentRaw,
  currentRaw,
  onKmApplied,
}: Options) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanState, setScanState] = useState<OdometerScanState>(ODOMETER_SCAN_IDLE);
  const getCurrentRawRef = useRef(getCurrentRaw);
  const onKmAppliedRef = useRef(onKmApplied);
  const pendingKmRef = useRef<string | null>(null);
  const detectedKmRef = useRef<string | null>(null);
  const scanStateRef = useRef(scanState);
  const photoUriRef = useRef<string | null>(null);
  const analyzingTick = useRef(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  getCurrentRawRef.current = getCurrentRaw;
  onKmAppliedRef.current = onKmApplied;
  scanStateRef.current = scanState;
  photoUriRef.current = photoUri;

  const clearStepTimer = useCallback(() => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (scanState.phase !== "analyzing") {
      clearStepTimer();
      return undefined;
    }

    analyzingTick.current = 0;
    stepTimer.current = setInterval(() => {
      analyzingTick.current = (analyzingTick.current + 1) % ODOMETER_SCAN_MESSAGES.length;
      const stepIndex = Math.min(3, 1 + Math.floor(analyzingTick.current / 2));
      setScanState((prev) =>
        prev.phase === "analyzing"
          ? {
              ...prev,
              message: ODOMETER_SCAN_MESSAGES[analyzingTick.current],
              stepIndex,
            }
          : prev,
      );
    }, 1200);

    return clearStepTimer;
  }, [clearStepTimer, scanState.phase]);

  useEffect(() => {
    const detected = detectedKmRef.current?.trim();
    if (!detected || currentRaw === undefined) return;

    setScanState((prev) => {
      const next = reconcileOdometerScanWithReading(prev, detected, currentRaw);
      if (next.pendingKm) pendingKmRef.current = next.pendingKm;
      else if (next.phase === "complete") pendingKmRef.current = null;
      return { ...next, detectedKm: detected };
    });
  }, [currentRaw]);

  const applyPendingReading = useCallback(() => {
    const pendingRaw = (pendingKmRef.current ?? scanStateRef.current.pendingKm)?.trim();
    if (!pendingRaw) return;

    const normalized = normalizeOdometerRaw(pendingRaw) || pendingRaw;
    pendingKmRef.current = null;
    onKmAppliedRef.current(normalized);
    setScanState((prev) => ({
      phase: "complete",
      message: `${normalized} KM applied · review and save`,
      appliedFields: ["KM reading"],
      pendingKm: null,
      detectedKm: normalized,
      processingSec: prev.processingSec,
      stepIndex: 3,
    }));
  }, []);

  const dismissPendingReading = useCallback(() => {
    pendingKmRef.current = null;
    setScanState((prev) => ({
      phase: "complete",
      message: prev.pendingKm
        ? `Kept ${normalizeOdometerRaw(getCurrentRawRef.current()) || getCurrentRawRef.current().trim() || "current"} KM · adjust manually if needed`
        : "Photo attached · enter KM manually",
      pendingKm: null,
      detectedKm: prev.detectedKm ?? detectedKmRef.current,
      appliedFields: [],
      processingSec: prev.processingSec,
      stepIndex: 3,
    }));
  }, []);

  const processOcrResult = useCallback(
    (
      result: Awaited<ReturnType<typeof extractOdometerPhotoOcr>>,
      processingSec?: number,
    ) => {
      const km = result.odometerKm?.value;
      const confidence = result.odometerKm?.confidence ?? 0;

      if (km != null && km >= 0 && confidence >= MIN_CONFIRM_CONFIDENCE) {
        const formatted = formatOdometerKmForEntry(km);
        detectedKmRef.current = formatted;
        const currentNorm = normalizeOdometerRaw(getCurrentRawRef.current());
        const lowConfidence = confidence < MIN_APPLY_CONFIDENCE;

        if (!currentNorm) {
          onKmAppliedRef.current(formatted);
          pendingKmRef.current = null;
          setScanState({
            ...buildOdometerScanCompleteState(formatted, true, processingSec),
            detectedKm: formatted,
          });
          return;
        }

        if (odometerReadingsEquivalent(currentNorm, formatted)) {
          pendingKmRef.current = null;
          setScanState({
            phase: "complete",
            message: `Reading confirmed · ${formatted} KM`,
            appliedFields: ["KM reading"],
            detectedKm: formatted,
            processingSec,
            stepIndex: 3,
            pendingKm: null,
          });
          return;
        }

        pendingKmRef.current = formatted;
        setScanState({
          ...buildOdometerScanConfirmState(formatted, currentNorm, processingSec, {
            lowConfidence,
          }),
          detectedKm: formatted,
        });
        return;
      }

      detectedKmRef.current = null;
      if (result.summary) {
        pendingKmRef.current = null;
        setScanState({
          phase: "complete",
          message: `${result.summary} · enter KM manually`,
          processingSec,
          stepIndex: 3,
          pendingKm: null,
          detectedKm: null,
        });
      } else {
        setScanState({
          phase: "complete",
          message: "Photo attached · enter KM manually",
          processingSec,
          stepIndex: 3,
          pendingKm: null,
          detectedKm: null,
        });
      }
    },
    [],
  );

  const runOcrOnUri = useCallback(
    async (uri: string) => {
      setScanning(true);
      pendingKmRef.current = null;
      setScanState({
        phase: "preparing",
        message: ODOMETER_SCAN_MESSAGES[0],
        appliedFields: [],
        stepIndex: 0,
        pendingKm: null,
      });

      try {
        setScanState({
          phase: "analyzing",
          message: ODOMETER_SCAN_MESSAGES[1],
          appliedFields: [],
          stepIndex: 1,
          pendingKm: null,
        });

        const result = await extractOdometerPhotoOcr(uri);
        processOcrResult(result, result.processingTimeSec);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not read odometer photo.";
        pendingKmRef.current = null;
        setScanState({
          phase: "error",
          message: `Photo attached · ${message}`,
          error: message,
          stepIndex: 0,
          pendingKm: null,
          detectedKm: detectedKmRef.current,
        });
      } finally {
        setScanning(false);
      }
    },
    [processOcrResult],
  );

  const handleCapture = useCallback(async () => {
    const picked = await captureOrPickImage({
      permissionTitle: "Camera required",
      permissionMessage,
      preferCamera: true,
    });
    if (!picked) return;

    setPhotoUri(picked.uri);
    detectedKmRef.current = null;
    await runOcrOnUri(picked.uri);
  }, [permissionMessage, runOcrOnUri]);

  const rescanPhoto = useCallback(async () => {
    const uri = photoUriRef.current?.trim();
    if (!uri) return;
    await runOcrOnUri(uri);
  }, [runOcrOnUri]);

  const reopenOcrReview = useCallback(() => {
    const detected = detectedKmRef.current?.trim();
    if (!detected) return;

    const currentNorm = normalizeOdometerRaw(getCurrentRawRef.current());
    if (!currentNorm) {
      pendingKmRef.current = detected;
      setScanState({
        ...buildOdometerScanCompleteState(detected, false, scanStateRef.current.processingSec),
        detectedKm: detected,
      });
      return;
    }

    if (odometerReadingsEquivalent(currentNorm, detected)) {
      setScanState({
        phase: "complete",
        message: `Reading confirmed · ${detected} KM`,
        appliedFields: ["KM reading"],
        detectedKm: detected,
        pendingKm: null,
        processingSec: scanStateRef.current.processingSec,
        stepIndex: 3,
      });
      return;
    }

    pendingKmRef.current = detected;
    setScanState({
      ...buildOdometerScanConfirmState(
        detected,
        currentNorm,
        scanStateRef.current.processingSec,
      ),
      detectedKm: detected,
    });
  }, []);

  const clearPhoto = useCallback(() => {
    pendingKmRef.current = null;
    detectedKmRef.current = null;
    setPhotoUri(null);
    setScanState(ODOMETER_SCAN_IDLE);
  }, []);

  return {
    photoUri,
    setPhotoUri,
    scanning,
    scanState,
    handleCapture,
    rescanPhoto,
    reopenOcrReview,
    clearPhoto,
    applyPendingReading,
    dismissPendingReading,
  };
}

export type { OdometerScanState } from "../odometerScan.types";
