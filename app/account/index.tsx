/**
 * My Account — personal identity hub.
 * Avatar, name, status (all editable). Phone/email/company are read-only.
 * KYC and org management live in /workspace.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { PartyAvatar } from '@/components/PartyAvatar';
import { EditProfileModal } from '@/features/auth';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Building2,
  Lock,
  MessageSquare,
  Pencil,
  Shield,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PURPLE = '#1a237e';
const PURPLE_MID = '#312e81';
const PURPLE_TINT = 'rgba(26,35,126,0.08)';
const PURPLE_BORDER = 'rgba(26,35,126,0.18)';
const TEAL = '#0f766e';
const TEAL_TINT = 'rgba(15,118,110,0.08)';
const AMBER = '#d97706';
const AMBER_TINT = 'rgba(217,119,6,0.08)';

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, color = PURPLE }: { label: string; color?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.accent, { backgroundColor: color }]} />
      <Text style={sh.title}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  accent: { width: 3, height: 14, borderRadius: 2 },
  title: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: Theme.textMuted },
});

function IdentityRow({
  icon,
  iconBg,
  label,
  value,
  locked,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  const inner = (
    <View style={row.wrap}>
      <View style={[row.iconBox, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View>
      <View style={row.textWrap}>
        <Text style={row.label}>{label}</Text>
        <Text style={row.value} numberOfLines={1}>{value || '—'}</Text>
      </View>
      {locked ? (
        <View style={row.lockBadge}><Lock size={10} color={Theme.textMuted} strokeWidth={2.2} /></View>
      ) : onPress ? (
        <View style={row.editBadge}><Pencil size={10} color={PURPLE} strokeWidth={2.4} /></View>
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [pressed && { opacity: 0.8 }]} onPress={onPress} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const row = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconBox: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.surfaceGray },
  textWrap: { flex: 1, minWidth: 0 },
  label: { fontSize: 10, fontWeight: '700', color: Theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 1 },
  value: { fontSize: 14, fontWeight: '600', color: Theme.textPrimaryDark },
  lockBadge: { width: 22, height: 22, borderRadius: 6, backgroundColor: Theme.surfaceGray, borderWidth: 1, borderColor: Theme.borderLight, alignItems: 'center', justifyContent: 'center' },
  editBadge: { width: 22, height: 22, borderRadius: 6, backgroundColor: PURPLE_TINT, borderWidth: 1, borderColor: PURPLE_BORDER, alignItems: 'center', justifyContent: 'center' },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, user, status } = useAuth();

  const [editModalVisible, setEditModalVisible] = useState(false);

  const isLoading = status === 'restoring';

  const fullName = profile?.full_name ?? profile?.displayName ?? '';
  const phone = profile?.phone ?? '';
  const email = user?.email ?? profile?.email ?? '';
  const company = profile?.company_name ?? '';

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ── Purple gradient hero ── */}
      <LinearGradient
        colors={[PURPLE, PURPLE_MID, '#2d1b69']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 6 }]}
      >
        <View style={styles.heroTopBar}>
          <Pressable style={styles.heroBtn} onPress={() => router.back()} hitSlop={8}>
            <FontAwesome name="arrow-left" size={16} color="rgba(255,255,255,0.9)" />
          </Pressable>
          <Text style={styles.heroTopTitle}>My Account</Text>
          <Pressable
            style={styles.heroBtn}
            onPress={() => setEditModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit name and status"
            hitSlop={8}
          >
            <Pencil size={15} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.heroAvatarSection}>
          <View style={styles.heroAvatarWrap}>
            <PartyAvatar
              name={fullName.trim() || 'User'}
              avatarUrl={profile?.avatar_url ?? null}
              avatarSeed={profile?.avatar_seed ?? null}
              size={78}
              borderStyle={{ borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' }}
            />
            <Pressable
              style={styles.heroCameraBtn}
              onPress={() => setEditModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <FontAwesome name="camera" size={10} color="#fff" />
            </Pressable>
          </View>
          <Text style={styles.heroName}>{fullName || 'No name set'}</Text>
          {profile?.status_text ? (
            <Text style={styles.heroStatus} numberOfLines={1}>{profile.status_text}</Text>
          ) : null}
          <View style={styles.roleBadge}>
            <Shield size={10} color="#fff" strokeWidth={2.5} />
            <Text style={styles.roleBadgeText}>PERSONAL ACCOUNT</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PERSONAL IDENTITY ── */}
        <View style={styles.card}>
          <SectionHeader label="Personal Identity" />
          <IdentityRow
            icon={<FontAwesome name="user" size={14} color={PURPLE} />}
            iconBg={PURPLE_TINT}
            label="Full Name"
            value={fullName}
            onPress={() => setEditModalVisible(true)}
          />
          <View style={styles.divider} />
          <IdentityRow
            icon={<FontAwesome name="phone" size={14} color={TEAL} />}
            iconBg={TEAL_TINT}
            label="Mobile"
            value={phone}
            locked
          />
          <View style={styles.divider} />
          <IdentityRow
            icon={<FontAwesome name="envelope" size={13} color={AMBER} />}
            iconBg={AMBER_TINT}
            label="Email"
            value={email}
            locked
          />
          {company ? (
            <>
              <View style={styles.divider} />
              <IdentityRow
                icon={<Building2 size={14} color={PURPLE} strokeWidth={2.2} />}
                iconBg={PURPLE_TINT}
                label="Registered Company"
                value={company}
                locked
              />
            </>
          ) : null}
          <View style={styles.lockedNote}>
            <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
            <Text style={styles.lockedNoteText}>
              Phone, email and company are set at signup and cannot be changed here.
            </Text>
          </View>
        </View>

        {/* ── HOW IDENTITY WORKS ── */}
        <View style={styles.card}>
          <SectionHeader label="How your identity works" />
          <View style={styles.identityRow}>
            <View style={[styles.identityIconBox, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
              <MessageSquare size={14} color="#4f46e5" strokeWidth={2.2} />
            </View>
            <View style={styles.identityText}>
              <Text style={styles.identityTitle}>Chat & team communications</Text>
              <Text style={styles.identityBody}>
                Your personal photo and name appear in trip chats and team messages.
              </Text>
            </View>
          </View>
          <View style={styles.identityDivider} />
          <View style={styles.identityRow}>
            <View style={[styles.identityIconBox, { backgroundColor: TEAL_TINT }]}>
              <Building2 size={14} color={TEAL} strokeWidth={2.2} />
            </View>
            <View style={styles.identityText}>
              <Text style={styles.identityTitle}>Network & partner visibility</Text>
              <Text style={styles.identityBody}>
                Your org logo represents the business on the load board, partner profiles and invoices.
                Manage it in Workspace settings.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <EditProfileModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={user?.email ?? profile?.email ?? ''}
        initialStatusText={profile?.status_text ?? ''}
        avatarPresetStyle="user-2d"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  loadingScreen: { flex: 1, backgroundColor: Theme.screenBackground, alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingBottom: 24 },
  heroTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, marginBottom: 2 },
  heroBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroTopTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  heroAvatarSection: { alignItems: 'center', paddingTop: 8, gap: 6 },
  heroAvatarWrap: { position: 'relative', width: 82, height: 82, marginBottom: 2 },
  heroCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: PURPLE_MID, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroName: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3, textAlign: 'center' },
  heroStatus: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 220 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', marginTop: 2 },
  roleBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 1.8 },

  // Cards
  content: { padding: Layout.screenPaddingHorizontal, gap: 12 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 18, borderWidth: 1, borderColor: Theme.borderInput, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderLight, marginLeft: 60 },

  // Locked note
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight, backgroundColor: Theme.surfaceGray },
  lockedNoteText: { fontSize: 10, color: Theme.textMuted, flex: 1, lineHeight: 14 },

  // Identity info
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  identityDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderLight, marginLeft: 60 },
  identityIconBox: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  identityText: { flex: 1 },
  identityTitle: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark, marginBottom: 3 },
  identityBody: { fontSize: 12, color: Theme.textSecondary, lineHeight: 17 },
});
