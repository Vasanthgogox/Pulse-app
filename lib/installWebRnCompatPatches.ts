/**
 * Web-only RN compatibility shims. Import this as early as possible in `app/_layout.tsx`
 * (before feature modules that call `StyleSheet.create`) so shadow* → boxShadow conversion
 * runs at stylesheet creation time.
 */
import { Platform, StyleSheet, type ViewStyle } from "react-native";

import { installDevConsoleFilters } from "@/lib/devConsoleFilters";
import { withWebSafeShadows } from "@/lib/platformViewStyle.util";

const PATCHED = Symbol.for("q.web.stylesheet.patched");

function installWebStyleSheetPatch(): void {
  if (Platform.OS !== "web") return;
  const create = StyleSheet.create as typeof StyleSheet.create & { [PATCHED]?: boolean };
  if (create[PATCHED]) return;
  const originalCreate = create.bind(StyleSheet);
  const patchedCreate = function patchedStyleSheetCreate<
    T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<Record<string, unknown>>,
  >(styles: T | StyleSheet.NamedStyles<T>): T {
    return originalCreate(
      withWebSafeShadows(styles as Record<string, ViewStyle>) as T,
    ) as T;
  };
  patchedCreate[PATCHED] = true;
  StyleSheet.create = patchedCreate as typeof StyleSheet.create;
}

installWebStyleSheetPatch();
installDevConsoleFilters();
