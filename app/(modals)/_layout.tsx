import { Stack } from 'expo-router';

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
      }}
    >
      <Stack.Screen
        name="add-client"
        options={{ presentation: 'fullScreenModal', title: 'Add Client' }}
      />
      <Stack.Screen
        name="edit-client"
        options={{ presentation: 'fullScreenModal', title: 'Edit Client' }}
      />
      <Stack.Screen
        name="add-supplier"
        options={{ presentation: 'fullScreenModal', title: 'Add Supplier' }}
      />
      <Stack.Screen
        name="add-driver"
        options={{ presentation: 'fullScreenModal', title: 'Add Driver' }}
      />
      <Stack.Screen
        name="add-vehicle"
        options={{ presentation: 'fullScreenModal', title: 'Add Vehicle' }}
      />
      <Stack.Screen
        name="ledger-sync"
        options={{ presentation: 'fullScreenModal', title: 'Ledger Sync' }}
      />
      <Stack.Screen name="language-settings" />
      <Stack.Screen name="sms-otp-parsing" />
      <Stack.Screen
        name="create-post"
        options={{ presentation: 'fullScreenModal', title: 'Create Post' }}
      />
      <Stack.Screen
        name="post-detail"
        options={{ presentation: 'modal', title: 'Post' }}
      />
    </Stack>
  );
}
