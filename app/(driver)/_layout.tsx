/**
 * Driver app layout (route group). When user has role=driver they land here after login.
 * Tabs: Dashboard, Trip, History, Wallet.
 * Not to be confused with app/driver/ which is for dispatchers (e.g. /driver/[id] = driver detail).
 */
import { DriverAvatarProvider } from '@/contexts/DriverAvatarContext';
import { DriverThemeProvider } from '@/contexts/DriverThemeContext';
import { DriverTabBar } from '@/components/driver/DriverTabBar';
import { Tabs } from 'expo-router';

function DriverTabsNavigator() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <DriverTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      {/* Keep route for internal dashboard flow, but hide from tab bar */}
      <Tabs.Screen name="control" options={{ title: 'Trip', href: null }} />
      <Tabs.Screen name="trips" options={{ title: 'History' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', href: null }} />
      <Tabs.Screen name="wallet" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
      <Tabs.Screen name="level-progression" options={{ title: 'Level progression', href: null }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      <Tabs.Screen name="passbook" options={{ title: 'Passbook', href: null }} />
      <Tabs.Screen name="salary-request" options={{ title: 'Salary Request', href: null }} />
    </Tabs>
  );
}

export default function DriverAppLayout() {
  return (
    <DriverThemeProvider>
      <DriverAvatarProvider>
        <DriverTabsNavigator />
      </DriverAvatarProvider>
    </DriverThemeProvider>
  );
}
