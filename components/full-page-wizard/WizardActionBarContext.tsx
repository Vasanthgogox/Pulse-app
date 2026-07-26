import { createContext, useContext, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Lets keypad steps host the shell action bar (Close / Continue) between the
 * amount and the numeric pad — so CTAs stay visible above the keypad.
 */
const WizardActionBarContext = createContext<ReactNode>(null);

export function WizardActionBarProvider({
  value,
  children,
}: {
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <WizardActionBarContext.Provider value={value}>
      {children}
    </WizardActionBarContext.Provider>
  );
}

export function useWizardActionBar(): ReactNode {
  return useContext(WizardActionBarContext);
}

export function WizardActionBarHost({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const actionBar = useWizardActionBar();
  if (!actionBar) return null;
  return <View style={style}>{actionBar}</View>;
}
