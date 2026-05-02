import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { ROUTES } from '@/lib/routes';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Web entry: Business vs Driver sign-up paths. “Sign In” goes to {@link ROUTES.SIGN_IN}.
 * Distinct URL from the sign-in form (`/sign-in`).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { user } = useAuth();
  const { locale, localeOptions } = useLanguage();
  const [webViewportWidth, setWebViewportWidth] = useState<number>(() => {
    if (Platform.OS !== 'web') return 0;
    if (typeof window === 'undefined') return 1280;
    return window.innerWidth || 1280;
  });
  const [webHasFinePointer, setWebHasFinePointer] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });
  const [typedPulse, setTypedPulse] = useState('');
  const businessIconPulse = useState(() => new Animated.Value(0))[0];
  const driverIconPulse = useState(() => new Animated.Value(0))[0];

  const isDesktop = Platform.OS === 'web' ? webViewportWidth >= 1024 && webHasFinePointer : false;

  const currentLanguageLabel =
    localeOptions.find((o) => o.value === locale)?.labelNative ??
    localeOptions.find((o) => o.value === locale)?.label ??
    'English';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const updatePointerMode = () => {
      if (typeof window.matchMedia !== 'function') {
        setWebHasFinePointer(true);
        return;
      }
      setWebHasFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    };
    const handleResize = () => {
      setWebViewportWidth(window.innerWidth || 1280);
      updatePointerMode();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    updatePointerMode();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  useEffect(() => {
    const full = 'PULSE';
    let idx = 0;
    setTypedPulse('');
    const timer = setInterval(() => {
      idx += 1;
      setTypedPulse(full.slice(0, idx));
      if (idx >= full.length) clearInterval(timer);
    }, 260);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const runPulse = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const businessAnim = runPulse(businessIconPulse, 1700);
    const driverAnim = runPulse(driverIconPulse, 2100);
    businessAnim.start();
    driverAnim.start();
    return () => {
      businessAnim.stop();
      driverAnim.stop();
      businessIconPulse.setValue(0);
      driverIconPulse.setValue(0);
    };
  }, [businessIconPulse, driverIconPulse]);

  const renderLanding = () => (
    <View style={[styles.landingWrap, isDesktop && styles.landingWrapDesktop]}>
      <TouchableOpacity
        style={[styles.modeCard, styles.businessCard]}
        activeOpacity={0.9}
        onPress={() => router.push(ROUTES.SIGN_UP)}
      >
        <Animated.View
          style={{
            transform: [
              {
                scale: businessIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
              {
                translateY: businessIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
            opacity: businessIconPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.86, 1],
            }),
          }}
        >
          <FontAwesome name="building-o" size={52} color="#94a3b8" />
        </Animated.View>
        <Text style={styles.modeTitle}>BUSINESS</Text>
        <Text style={styles.modeSubtitle}>Fleet management and company tools.</Text>
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>Sign up for Business</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeCard, styles.driverCard]}
        activeOpacity={0.9}
        onPress={() => router.push('/driver-signup')}
      >
        <Animated.View
          style={{
            transform: [
              {
                scale: driverIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
              {
                translateY: driverIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
            opacity: driverIconPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1],
            }),
          }}
        >
          <FontAwesome name="truck" size={52} color={Theme.driverEmeraldDark} />
        </Animated.View>
        <Text style={styles.modeTitle}>DRIVER</Text>
        <Text style={styles.modeSubtitle}>Earn money on every trip you take.</Text>
        <View style={[styles.modePill, styles.modePillDriver]}>
          <Text style={styles.modePillText}>Sign up as Driver</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        styles.containerLanding,
        isDesktop ? styles.containerDesktop : null,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>No internet connection.</Text>
        </View>
      ) : null}

      <View style={styles.topBar}>
        <Text style={[styles.brand, styles.brandOnDark]}>
          {typedPulse}
          <Text style={styles.logoDot}>.</Text>
        </Text>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={() => router.push(ROUTES.SIGN_IN)} style={[styles.topBtn, styles.topBtnOnDark]}>
            <Text style={styles.topBtnText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(modals)/language-settings')}
            style={[styles.globeBtn, styles.globeBtnOnDark]}
          >
            <FontAwesome name="globe" size={16} color={Theme.textOnDark} />
          </TouchableOpacity>
          <Text style={[styles.langText, styles.langTextOnDark, styles.langPill]}>{currentLanguageLabel}</Text>
        </View>
      </View>

      {renderLanding()}

      <TouchableOpacity
        onPress={() =>
          router.replace(Platform.OS === 'web' ? ROUTES.TERMINAL_WEBSITE : ROUTES.SIGN_IN)
        }
        style={styles.backFloating}
      >
        <FontAwesome name="chevron-left" size={14} color={Theme.textMuted} />
        <Text style={styles.backFloatingText}>{Platform.OS === 'web' ? 'Website' : 'Back'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  containerLanding: {
    backgroundColor: '#020617',
    paddingHorizontal: 0,
  },
  containerDesktop: {
    backgroundColor: '#020617',
    paddingHorizontal: 0,
  },
  offlineBanner: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.negative,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  offlineText: {
    textAlign: 'center',
    color: Theme.negative,
    fontSize: 12,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.7,
    color: Theme.textPrimaryDark,
  },
  brandOnDark: {
    color: '#ffffff',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBtn: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topBtnOnDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  globeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeBtnOnDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  langText: {
    fontSize: 11,
    color: Theme.textMuted,
    fontWeight: '700',
  },
  langTextOnDark: {
    color: 'rgba(255,255,255,0.92)',
  },
  langPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  landingWrap: {
    flex: 1,
    gap: 12,
    flexDirection: 'column',
    paddingTop: 76,
    paddingBottom: 12,
  },
  landingWrapDesktop: {
    flexDirection: 'row',
    gap: 0,
    paddingTop: 64,
  },
  modeCard: {
    flex: 1,
    borderRadius: 0,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  businessCard: {
    backgroundColor: '#020617',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  driverCard: {
    backgroundColor: '#041524',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeTitle: {
    marginTop: 16,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: Theme.textOnDark,
  },
  modeSubtitle: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    color: 'rgba(148,163,184,0.72)',
    maxWidth: 280,
  },
  modePill: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modePillDriver: {
    borderColor: 'rgba(16,185,129,0.25)',
    backgroundColor: '#10b981',
  },
  modePillText: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  logoDot: {
    color: Theme.driverPrimary,
  },
  backFloating: {
    position: 'absolute',
    left: 18,
    bottom: 16,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backFloatingText: {
    color: Theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
