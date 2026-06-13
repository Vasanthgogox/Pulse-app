import { useCallback, useEffect, useRef, useState } from "react";

import { captureOrPickImage } from "@/lib/media/captureImage.util";

import {
  buildBillScanAppliedState,
  buildBillScanConfirmState,
  buildBillScanDismissedState,
  buildBillScanCompleteState,
  type BillFieldUpdateAction,
} from "./applyExpenseReceiptOcr.util";
import {
  extractExpenseReceiptOcr,
  type ExpenseBillKind,
  type ExpenseReceiptOcrResult,
} from "./expenseReceiptOcr.service";
import { BILL_SCAN_ANALYZING_MESSAGES } from "./expenseBillScan.constants";
import { BILL_SCAN_IDLE, type BillPendingFieldUpdate, type BillScanState } from "./expenseBillScan.types";

export type ExpenseBillPreviewFn = (result: ExpenseReceiptOcrResult) => BillFieldUpdateAction[];

type Options = {
  kind: ExpenseBillKind;
  permissionMessage: string;
  previewOcrUpdates: ExpenseBillPreviewFn;
};

export type ExpenseBillCaptureBag = {
  photoUri: string | null;
  setPhotoUri: (uri: string | null) => void;
  scanning: boolean;
  billScan: BillScanState;
  handleCapture: () => Promise<void>;
  handleRemovePhoto: () => void;
  applyPendingUpdates: () => void;
  dismissPendingUpdates: () => void;
  reopenOcrReview: () => void;
  registerPreviewUpdates: (fn: ExpenseBillPreviewFn) => void;
  hasOcrResult: boolean;
};

function toPendingDisplay(updates: BillFieldUpdateAction[]): BillPendingFieldUpdate[] {
  return updates.map(({ id, label, fromDisplay, toDisplay }) => ({
    id,
    label,
    fromDisplay,
    toDisplay,
  }));
}

export function useExpenseBillCapture({
  kind,
  permissionMessage,
  previewOcrUpdates,
}: Options): ExpenseBillCaptureBag {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [billScan, setBillScan] = useState<BillScanState>(BILL_SCAN_IDLE);
  const analyzingTick = useRef(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUpdatesRef = useRef<BillFieldUpdateAction[]>([]);
  const processingSecRef = useRef<number | undefined>(undefined);
  const lastOcrResultRef = useRef<ExpenseReceiptOcrResult | null>(null);
  const previewFnRef = useRef<ExpenseBillPreviewFn>(previewOcrUpdates);
  const appliedOcrUpdatesRef = useRef<BillPendingFieldUpdate[]>([]);

  previewFnRef.current = previewOcrUpdates;

  const clearStepTimer = useCallback(() => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }, []);

  const setConfirmFromResult = useCallback((result: ExpenseReceiptOcrResult, updates: BillFieldUpdateAction[]) => {
    pendingUpdatesRef.current = updates;
    if (updates.length > 0) {
      setBillScan(buildBillScanConfirmState(result, toPendingDisplay(updates)));
      return;
    }
    pendingUpdatesRef.current = [];
    setBillScan({
      ...buildBillScanCompleteState(result, []),
      stepIndex: 3,
    });
  }, []);

  const registerPreviewUpdates = useCallback(
    (fn: ExpenseBillPreviewFn) => {
      previewFnRef.current = fn;
      const last = lastOcrResultRef.current;
      if (!last) return;

      const updates = fn(last);
      pendingUpdatesRef.current = updates;

      setBillScan((prev) => {
        if (updates.length === 0) {
          if (prev.phase === "confirm") {
            return {
              ...buildBillScanCompleteState(last, []),
              stepIndex: 3,
            };
          }
          return prev;
        }
        return buildBillScanConfirmState(last, toPendingDisplay(updates));
      });
    },
    [],
  );

  useEffect(() => {
    if (billScan.phase !== "analyzing") {
      clearStepTimer();
      return undefined;
    }

    analyzingTick.current = 0;
    stepTimer.current = setInterval(() => {
      analyzingTick.current = (analyzingTick.current + 1) % BILL_SCAN_ANALYZING_MESSAGES.length;
      const stepIndex = Math.min(3, 1 + Math.floor(analyzingTick.current / 2));
      setBillScan((prev) =>
        prev.phase === "analyzing"
          ? {
              ...prev,
              message: BILL_SCAN_ANALYZING_MESSAGES[analyzingTick.current],
              stepIndex,
            }
          : prev,
      );
    }, 1200);

    return clearStepTimer;
  }, [billScan.phase, clearStepTimer]);

  const applyPendingUpdates = useCallback(() => {
    const pending = pendingUpdatesRef.current;
    if (pending.length === 0) return;

    pending.forEach((update) => update.apply());
    const applied = toPendingDisplay(pending);
    appliedOcrUpdatesRef.current = applied;
    pendingUpdatesRef.current = [];
    setBillScan(buildBillScanAppliedState(applied, processingSecRef.current));
  }, []);

  const dismissPendingUpdates = useCallback(() => {
    pendingUpdatesRef.current = [];
    setBillScan(buildBillScanDismissedState(processingSecRef.current));
  }, []);

  const reopenOcrReview = useCallback(() => {
    const last = lastOcrResultRef.current;
    if (!last) return;

    const updates = previewFnRef.current(last);
    if (updates.length === 0) return;

    setConfirmFromResult(last, updates);
  }, [setConfirmFromResult]);

  const handleCapture = useCallback(async () => {
    const picked = await captureOrPickImage({
      permissionTitle: "Camera required",
      permissionMessage,
    });
    if (!picked) return;

    setPhotoUri(picked.uri);
    setScanning(true);
    pendingUpdatesRef.current = [];
    appliedOcrUpdatesRef.current = [];
    setBillScan({
      phase: "preparing",
      message: "Optimizing bill photo…",
      appliedFields: [],
      stepIndex: 0,
    });

    try {
      const result = await extractExpenseReceiptOcr(picked.uri, kind, (phase) => {
        if (phase === "preparing") {
          setBillScan({
            phase: "preparing",
            message: "Optimizing bill photo…",
            appliedFields: [],
            stepIndex: 0,
          });
          return;
        }
        setBillScan({
          phase: "analyzing",
          message: BILL_SCAN_ANALYZING_MESSAGES[0],
          appliedFields: [],
          stepIndex: 1,
        });
      });

      lastOcrResultRef.current = result;
      processingSecRef.current = result.processingTimeSec;
      const updates = previewFnRef.current(result);
      setConfirmFromResult(result, updates);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bill scan failed. Enter details manually.";
      pendingUpdatesRef.current = [];
      lastOcrResultRef.current = null;
      setBillScan({
        phase: "error",
        message: `Bill attached · ${message}`,
        appliedFields: [],
        error: message,
        stepIndex: 0,
      });
    } finally {
      setScanning(false);
    }
  }, [kind, permissionMessage, setConfirmFromResult]);

  const handleRemovePhoto = useCallback(() => {
    pendingUpdatesRef.current = [];
    appliedOcrUpdatesRef.current = [];
    lastOcrResultRef.current = null;
    setPhotoUri(null);
    setBillScan(BILL_SCAN_IDLE);
  }, []);

  return {
    photoUri,
    setPhotoUri,
    scanning,
    billScan,
    handleCapture,
    handleRemovePhoto,
    applyPendingUpdates,
    dismissPendingUpdates,
    reopenOcrReview,
    registerPreviewUpdates,
    hasOcrResult: photoUri != null || billScan.phase !== "idle",
  };
}

/** Rebind OCR preview when form fields / category change (unified expense shell). */
export function useRegisterExpenseBillPreview(
  billCapture: ExpenseBillCaptureBag | undefined,
  previewFn: ExpenseBillPreviewFn,
) {
  useEffect(() => {
    if (!billCapture) return undefined;
    billCapture.registerPreviewUpdates(previewFn);
    return undefined;
  }, [billCapture, previewFn]);
}
