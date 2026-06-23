import { Link, Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import { ROUTES } from '@/lib/routes';

export default function NotFoundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>This screen doesn&apos;t exist</Text>
        <Text style={styles.subtitle}>The link may be outdated or the page was moved.</Text>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(ROUTES.INDEX);
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>

        <Link href={ROUTES.INDEX} replace style={styles.link}>
          <Text style={styles.linkText}>Go to home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: Theme.screenBackground,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  primaryBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  link: {
    marginTop: 16,
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.primary,
  },
});
