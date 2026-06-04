/**
 * Warm chat route: prefetch the lazy screen chunk + provider modules before navigation.
 * Call from tab bar (onPressIn), trips/network tabs, or when chat routes become active.
 */

let chatScreenModule: Promise<typeof import("@/features/chat/components/ChatScreen")> | null =
  null;
let chatProvidersModule: Promise<
  [
    typeof import("@/features/chat/contexts/TripChatContext"),
    typeof import("@/features/chat/contexts/IntegratedChatContext"),
  ]
> | null = null;

export function preloadChatScreenModule(): Promise<
  typeof import("@/features/chat/components/ChatScreen")
> {
  if (!chatScreenModule) {
    chatScreenModule = import("@/features/chat/components/ChatScreen");
  }
  return chatScreenModule;
}

export function preloadChatProviderModules(): Promise<
  [
    typeof import("@/features/chat/contexts/TripChatContext"),
    typeof import("@/features/chat/contexts/IntegratedChatContext"),
  ]
> {
  if (!chatProvidersModule) {
    chatProvidersModule = Promise.all([
      import("@/features/chat/contexts/TripChatContext"),
      import("@/features/chat/contexts/IntegratedChatContext"),
    ]);
  }
  return chatProvidersModule;
}

/** Start Zustand bootstrap RPC without mounting chat providers (safe to call early). */
function preloadChatBootstrap(orgId: string): void {
  const id = orgId.trim();
  if (!id) return;
  void import("@/features/chat/store/useChatStore").then(({ useChatStore }) => {
    void useChatStore.getState().bootstrap(id);
  });
}

/** Screen chunk + providers; optional org starts bootstrap on finger-down. */
export function preloadChatRoute(orgId?: string | null): void {
  void preloadChatScreenModule();
  void preloadChatProviderModules();
  if (orgId) preloadChatBootstrap(orgId);
}
