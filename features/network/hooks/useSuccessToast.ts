/**
 * useSuccessToast — lightweight toast pattern for success messages.
 */
import { useCallback, useState } from "react";

export function useSuccessToast() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const trigger = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setShowSuccess(true);
    const t = setTimeout(() => setShowSuccess(false), 1500);
    return () => clearTimeout(t);
  }, []);

  return { showSuccess, successMsg, trigger };
}
