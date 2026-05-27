/**
 * In-card feedback for the workspace flex card.
 *
 * Workspace panels (Account, Edit, Settings, KYC, Team) all live inside a
 * 40vw side overlay. RN's `Alert.alert` on web shows a fullscreen native
 * dialog that escapes the card, so we provide an in-layout alternative:
 *
 * - `notice({ kind, title, message })` → stacked auto-dismiss banners
 *   anchored to the top of the card.
 * - `confirm({ title, message, ... })` → centered confirm card with a
 *   scoped backdrop. Awaits a boolean.
 *
 * Mounted by `app/workspace.tsx` so the banner/confirm UI is clipped to
 * the flex card. Panels consume it via `useWorkspaceFeedback()`.
 */
import Theme from "@/constants/Theme";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const PURPLE = "#4F46E5";

type NoticeKind = "success" | "error" | "info";

type NoticeItem = {
  id: number;
  kind: NoticeKind;
  title: string;
  message?: string;
  duration: number;
};

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export type WorkspaceFeedback = {
  notice: (opts: {
    kind?: NoticeKind;
    title: string;
    message?: string;
    duration?: number;
  }) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const WorkspaceFeedbackCtx = createContext<WorkspaceFeedback | null>(null);

/** Read the in-card feedback API from any panel rendered inside the provider. */
export function useWorkspaceFeedback(): WorkspaceFeedback {
  const value = useContext(WorkspaceFeedbackCtx);
  if (!value) {
    throw new Error(
      "useWorkspaceFeedback must be used inside <WorkspaceFeedbackProvider>",
    );
  }
  return value;
}

export function WorkspaceFeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const idCounter = useRef(0);

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((n) => n.id !== id));
  }, []);

  const notice = useCallback<WorkspaceFeedback["notice"]>(
    ({ kind = "info", title, message, duration = 4200 }) => {
      idCounter.current += 1;
      const id = idCounter.current;
      setNotices((current) => [
        ...current,
        { id, kind, title, message, duration },
      ]);
    },
    [],
  );

  const confirm = useCallback<WorkspaceFeedback["confirm"]>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve });
      }),
    [],
  );

  const api = useMemo<WorkspaceFeedback>(
    () => ({ notice, confirm }),
    [notice, confirm],
  );

  const handleConfirm = () => {
    confirmState?.resolve(true);
    setConfirmState(null);
  };
  const handleCancel = () => {
    confirmState?.resolve(false);
    setConfirmState(null);
  };

  return (
    <WorkspaceFeedbackCtx.Provider value={api}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={styles.noticeStack}>
          {notices.map((n) => (
            <NoticeBanner key={n.id} item={n} onDismiss={dismissNotice} />
          ))}
        </View>
        {confirmState ? (
          <ConfirmOverlay
            options={confirmState}
            onCancel={handleCancel}
            onConfirm={handleConfirm}
          />
        ) : null}
      </View>
    </WorkspaceFeedbackCtx.Provider>
  );
}

function NoticeBanner({
  item,
  onDismiss,
}: {
  item: NoticeItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const t = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration, onDismiss]);

  const palette = noticePalette[item.kind];
  const Icon = palette.Icon;

  return (
    <View style={[styles.noticeCard, { borderLeftColor: palette.accent }]}>
      <View style={[styles.noticeIcon, { backgroundColor: palette.iconBg }]}>
        <Icon size={14} color={palette.accent} strokeWidth={2.4} />
      </View>
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.message ? (
          <Text style={styles.noticeMessage} numberOfLines={3}>
            {item.message}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => onDismiss(item.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
        style={({ pressed }) => [styles.noticeClose, pressed && { opacity: 0.6 }]}
      >
        <X size={13} color={Theme.textMuted} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function ConfirmOverlay({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmLabel = options.confirmLabel ?? "Confirm";
  const cancelLabel = options.cancelLabel ?? "Cancel";
  const destructive = options.destructive ?? false;

  return (
    <View style={styles.confirmRoot}>
      <Pressable
        style={styles.confirmBackdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={styles.confirmCard}>
        <View
          style={[
            styles.confirmIconWrap,
            { backgroundColor: destructive ? "rgba(220,38,38,0.1)" : "rgba(79,70,229,0.1)" },
          ]}
        >
          <AlertTriangle
            size={20}
            color={destructive ? Theme.negative : PURPLE}
            strokeWidth={2.4}
          />
        </View>
        <Text style={styles.confirmTitle}>{options.title}</Text>
        {options.message ? (
          <Text style={styles.confirmMessage}>{options.message}</Text>
        ) : null}
        <View style={styles.confirmActions}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.confirmCancel,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text style={styles.confirmCancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.confirmAccept,
              destructive && styles.confirmAcceptDanger,
              pressed && { opacity: 0.9 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text style={styles.confirmAcceptText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const noticePalette: Record<
  NoticeKind,
  { accent: string; iconBg: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    accent: "#0f766e",
    iconBg: "rgba(15,118,110,0.12)",
    Icon: CheckCircle2,
  },
  error: {
    accent: Theme.negative,
    iconBg: "rgba(220,38,38,0.1)",
    Icon: AlertTriangle,
  },
  info: {
    accent: PURPLE,
    iconBg: "rgba(79,70,229,0.1)",
    Icon: Info,
  },
};

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  noticeStack: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    gap: 8,
    zIndex: 50,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderLeftWidth: 3,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  noticeIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  noticeText: { flex: 1, minWidth: 0, gap: 2 },
  noticeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  noticeMessage: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  noticeClose: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmRoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    zIndex: 100,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.42)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "stretch",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  confirmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    alignSelf: "flex-start",
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  confirmMessage: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 19,
    marginBottom: 18,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  confirmCancel: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  confirmCancelText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  confirmAccept: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: PURPLE,
  },
  confirmAcceptDanger: { backgroundColor: Theme.negative },
  confirmAcceptText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
