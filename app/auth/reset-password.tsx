import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { signUpPasswordInputProps } from '@/lib/signupPasswordInput.util';
import { useLanguage } from '@/contexts/LanguageContext';
import { updatePasswordWithCurrentSession } from '@/features/auth/services/auth.service';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { containsNullByte, validatePassword } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { useRouter, useRootNavigationState, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function parseTokensFromUrl(fullUrl: string): {
  code?: string;
  access_token?: string;
  refresh_token?: string;
} {
  let code: string | undefined;
  const beforeHash = fullUrl.split('#')[0];
  const qIndex = beforeHash.indexOf('?');
  if (qIndex !== -1) {
    const qs = new URLSearchParams(beforeHash.slice(qIndex + 1));
    const c = qs.get('code');
    if (c) code = c;
  }
  let access_token: string | undefined;
  let refresh_token: string | undefined;
  const hashIdx = fullUrl.indexOf('#');
  if (hashIdx !== -1) {
    const hp = new URLSearchParams(fullUrl.slice(hashIdx + 1));
    access_token = hp.get('access_token') ?? undefined;
    refresh_token = hp.get('refresh_token') ?? undefined;
  }
  return { code, access_token, refresh_token };
}

export default function AuthResetPassword() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { t } = useLanguage();

  const establishedRef = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tryEstablish = useCallback(async (fullUrl: string): Promise<boolean> => {
    await supabase().auth.signOut({ scope: 'local' });
    const { code, access_token, refresh_token } = parseTokensFromUrl(fullUrl);
    if (code) {
      const { error } = await supabase().auth.exchangeCodeForSession(code);
      if (error) throw new Error(error.message);
      return true;
    }
    if (access_token && refresh_token) {
      const { error } = await supabase().auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) throw new Error(error.message);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (establishedRef.current) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let linkingSub: ReturnType<typeof Linking.addEventListener> | undefined;

    const fail = (key: string) => {
      if (cancelled) return;
      setLoadErrorKey(key);
      setPhase('error');
    };

    const succeedWebStrip = () => {
      if (cancelled) return;
      establishedRef.current = true;
      setPhase('ready');
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    void (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const ok = await tryEstablish(window.location.href);
          if (cancelled) return;
          if (ok) succeedWebStrip();
          else fail('resetLinkInvalid');
          return;
        }

        const initial = await Linking.getInitialURL();
        if (initial && (await tryEstablish(initial))) {
          if (cancelled) return;
          establishedRef.current = true;
          setPhase('ready');
          return;
        }

        linkingSub = Linking.addEventListener('url', ({ url }) => {
          void (async () => {
            if (cancelled || establishedRef.current) return;
            try {
              if (await tryEstablish(url)) {
                establishedRef.current = true;
                setPhase('ready');
                if (timeoutId) clearTimeout(timeoutId);
                linkingSub?.remove();
              }
            } catch {
              if (!cancelled) fail('resetLinkInvalid');
            }
          })();
        });

        timeoutId = setTimeout(() => {
          if (cancelled || establishedRef.current) return;
          fail('resetLinkInvalid');
          linkingSub?.remove();
        }, 15000);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '';
        fail(msg && msg.length < 200 ? msg : 'resetLinkInvalid');
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      linkingSub?.remove();
    };
  }, [rootNavigationState?.key, tryEstablish]);

  const onSubmit = async () => {
    setFormError(null);
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      setFormError(pwdErr);
      return;
    }
    if (password !== confirm) {
      setFormError(t('passwordsDoNotMatch'));
      return;
    }
    if (containsNullByte(password)) {
      setFormError(t('passwordInvalidChars'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await updatePasswordWithCurrentSession(password);
      if (error) {
        setFormError(error.message);
        return;
      }
      await supabase().auth.signOut({ scope: 'local' });
      router.replace(`${ROUTES.SIGN_IN}?password_reset=1` as Href);
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return <CenteredLoadingView message={t('resetPasswordLoading')} color={Theme.primary} />;
  }

  if (phase === 'error') {
    const msg =
      loadErrorKey && loadErrorKey !== 'resetLinkInvalid'
        ? loadErrorKey
        : t('resetLinkInvalid');
    return (
      <View style={[styles.centerWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.errorTitle}>{t('resetLinkInvalidTitle')}</Text>
        <Text style={styles.errorBody}>{msg}</Text>
        <TouchableOpacity onPress={() => router.replace(ROUTES.FORGOT_PASSWORD)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t('sendResetLink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace(ROUTES.SIGN_IN)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>{t('backToSignIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      <Text style={styles.title}>{t('resetPasswordTitle')}</Text>
      <Text style={styles.subtitle}>{t('resetPasswordSubtitle')}</Text>

      <View style={styles.passwordWrap}>
        <TextInput
          {...signUpPasswordInputProps('new')}
          value={password}
          onChangeText={(v) => {
            setFormError(null);
            setPassword(v);
          }}
          placeholder={t('newPasswordPlaceholder')}
          placeholderTextColor={Theme.textMuted}
          style={styles.input}
          secureTextEntry={!showPass}
          maxLength={128}
        />
        <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn}>
          <FontAwesome name={showPass ? 'eye-slash' : 'eye'} size={18} color={Theme.textMuted} />
        </Pressable>
      </View>

      <TextInput
        {...signUpPasswordInputProps('confirm')}
        value={confirm}
        onChangeText={(v) => {
          setFormError(null);
          setConfirm(v);
        }}
        placeholder={t('confirmPasswordPlaceholder')}
        placeholderTextColor={Theme.textMuted}
        style={[styles.input, styles.inputConfirm]}
        secureTextEntry={!showPass}
        maxLength={128}
      />

      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

      <TouchableOpacity
        onPress={() => void onSubmit()}
        style={[styles.primaryBtn, submitting && styles.disabledBtn]}
        disabled={submitting}
      >
        {submitting ? (
          <LoadingIndicator color={Theme.textOnPrimary} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('saveNewPassword')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace(ROUTES.SIGN_IN)} style={styles.backRow}>
        <FontAwesome name="chevron-left" size={14} color={Theme.textMuted} />
        <Text style={styles.backText}>{t('backToSignIn')}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  centerWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.textMuted,
    marginBottom: 20,
  },
  passwordWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 44,
    fontSize: 16,
    color: Theme.textPrimary,
  },
  inputConfirm: {
    paddingRight: 14,
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: 12,
    padding: 4,
  },
  errorText: {
    color: Theme.negative,
    fontSize: 13,
    marginBottom: 10,
    marginTop: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: Theme.textMuted,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: Theme.driverPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Theme.textMuted,
    fontSize: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 28,
  },
  backText: {
    color: Theme.textMuted,
    fontSize: 14,
  },
});
