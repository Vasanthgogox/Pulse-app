import { useSyncExternalStore } from "react";

let networkDockExpanded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setMobileNetworkDockExpanded(expanded: boolean) {
  if (networkDockExpanded === expanded) return;
  networkDockExpanded = expanded;
  emit();
}

export function useMobileNetworkDockExpanded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => networkDockExpanded,
    () => false,
  );
}
