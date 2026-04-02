import Theme from './Theme';

export default {
  light: {
    text: Theme.textPrimary,
    background: Theme.screenBackground,
    tint: Theme.primary,
    tabIconDefault: Theme.textMuted,
    tabIconSelected: Theme.primary,
  },
  dark: {
    text: Theme.textOnDark,
    background: Theme.darkBackground,
    tint: Theme.primary,
    tabIconDefault: Theme.textMuted,
    tabIconSelected: Theme.primary,
  },
};

