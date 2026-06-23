import Theme from "@/constants/Theme";

export type LoadCenterTabStripPalette = {
  bg: string;
  bgIdle: string;
  trayBg: string;
  trayBorder: string;
  border: string;
  borderSoft: string;
  text: string;
  textMuted: string;
  /** Active underline — variant accent (yellow / ink / pink). */
  underline: string;
};

export const LOAD_CENTER_TAB_STRIP_PALETTES = {
  yellow: {
    bg: Theme.loadMainTabBg,
    bgIdle: Theme.loadMainTabBgIdle,
    trayBg: Theme.loadMainTabTrayBg,
    trayBorder: Theme.loadMainTabTrayBorder,
    border: Theme.loadMainTabBorder,
    borderSoft: Theme.loadMainTabBorderSoft,
    text: Theme.loadMainTabText,
    textMuted: Theme.loadMainTabTextMuted,
    underline: Theme.loadMainTabBorder,
  },
  blue: {
    bg: Theme.loadStatusTabBg,
    bgIdle: Theme.loadStatusTabBgIdle,
    trayBg: Theme.loadStatusTabTrayBg,
    trayBorder: Theme.loadStatusTabTrayBorder,
    border: Theme.loadStatusTabBorder,
    borderSoft: Theme.loadStatusTabBorderSoft,
    text: Theme.loadStatusTabText,
    textMuted: Theme.loadStatusTabTextMuted,
    underline: Theme.loadStatusTabBorder,
  },
  pink: {
    bg: Theme.loadDoneSubTabBg,
    bgIdle: Theme.loadDoneSubTabBgIdle,
    trayBg: Theme.loadDoneSubTabTrayBg,
    trayBorder: Theme.loadDoneSubTabTrayBorder,
    border: Theme.loadDoneSubTabBorder,
    borderSoft: Theme.loadDoneSubTabBorderSoft,
    text: Theme.loadDoneSubTabText,
    textMuted: Theme.loadDoneSubTabTextMuted,
    underline: Theme.loadDoneSubTabBg,
  },
} as const satisfies Record<string, LoadCenterTabStripPalette>;

export type LoadCenterTabStripVariant = keyof typeof LOAD_CENTER_TAB_STRIP_PALETTES;
