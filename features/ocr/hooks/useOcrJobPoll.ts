import { useEffect, useRef } from "react";

import { getOcrJobById } from "@/features/ocr/services/ocrJob.service";
import type { OcrJobRow } from "@/features/ocr/types/ocr.types";

const POLL_MS = 2000;

type Options = {
  jobId: string | null | undefined;
  enabled?: boolean;
  onUpdate?: (job: OcrJobRow) => void;
  onTerminal?: (job: OcrJobRow) => void;
};

/** Poll persisted ocr_jobs — read-only, never invokes Gemini. */
export function useOcrJobPoll({ jobId, enabled = true, onUpdate, onTerminal }: Options) {
  const onUpdateRef = useRef(onUpdate);
  const onTerminalRef = useRef(onTerminal);
  onUpdateRef.current = onUpdate;
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    if (!enabled || !jobId) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const job = await getOcrJobById(jobId);
        if (!job || cancelled) return;
        onUpdateRef.current?.(job);
        if (job.status === "completed" || job.status === "failed") {
          if (timer) clearInterval(timer);
          onTerminalRef.current?.(job);
        }
      } catch {
        /* transient network */
      }
    };

    void poll();
    timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled, jobId]);
}
