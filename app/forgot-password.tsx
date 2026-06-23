import Layout from '@/constants/Layout';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { requestPasswordResetEmail } from '@/features/auth/services/auth.service';
import { validateEmailRequired } from '@/lib/emailValidation';
import { ROUTES } from '@/lib/routes';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getEmailFromParams(params: { email?: string | string[] }): string {
  const e = params.email;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { t } = useLanguage();
  const isOnline = useIsOnline();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setEmail(getEmailFromParams(params));
  }, [params.email]);

  const onSubmit = async () => {
    setError(null);
    if (!isOnline) {
      setError(t('noInternetConnection'));
      return;
    }
    const emailErr = validateEmailRequired(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setLoading(true);
    try {
      const { error: e } = await requestPasswordResetEmail(email.trim());
      if (e) {
        setError(e.message);
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{t('noInternetConnection')}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{t('forgotPasswordTitle')}</Text>
      <Text style={styles.subtitle}>{t('forgotPasswordSubtitle')}</Text>

      {sent ? (
        <Text style={styles.info}>{t('resetEmailSentInfo')}</Text>
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setError(null);
              setEmail(v);
            }}
            placeholder={t('emailPlaceholder')}
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            maxLength={255}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            onPress={() => void onSubmit()}
            style={[styles.primaryBtn, (loading || !isOnline) && styles.disabledBtn]}
            disabled={loading || !isOnline}
          >
            {loading ? (
              <LoadingIndicator color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('sendResetLink')}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

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
  offlineBanner: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.negative,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  offlineText: {
    textAlign: 'center',
    color: Theme.negative,
    fontSize: 12,
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
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Theme.textPrimary,
    marginBottom: 12,
  },
  errorText: {
    color: Theme.negative,
    fontSize: 13,
    marginBottom: 10,
  },
  info: {
    fontSize: 14,
    color: Theme.textSecondary,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: Theme.driverPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: '600',
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
