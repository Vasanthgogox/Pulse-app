import { PartyAvatar } from '@/components/PartyAvatar';
import { View, Text, TouchableOpacity, StyleSheet, Image, type ImageSourcePropType } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import type { PartyEntityType } from '@/lib/partyAvatarDisplay';
import { partyAvatarHasRenderableOutput } from '@/lib/partyAvatarDisplay';

export interface EntityRowProps {
  title: string;
  subtitle?: string;
  subtitleLeft?: string;
  subtitleRight?: string;
  amount?: string;
  amountLabel?: string;
  amountColor?: 'green' | 'red' | 'default';
  /** When set, right amount uses this color instead of amountColor (e.g. Get=green, Give=red). */
  rightAmountColor?: 'green' | 'red' | 'default';
  onPress?: () => void;
  /** When set (e.g. vehicle list), show this image instead of title initial in the avatar area. */
  avatarImage?: ImageSourcePropType;
  /** Optional second amount (e.g. trip: You'll give). */
  rightAmount?: string;
  rightAmountLabel?: string;
  /** Set false to hide avatar and save space (e.g. trips list). Default true. */
  showAvatar?: boolean;
  /** When set, shows a small pill: Integrated (green) or Manual (muted). */
  integrationStatus?: 'integrated' | 'offline';
  /** Linked org / contact photo (storage path or http). */
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  entityType?: PartyEntityType;
}

function getInitial(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase();
}

/** Alternate avatar style: first row indigo, second slate (like reference) */
function getAvatarStyle(index?: number) {
  if (index !== undefined && index % 2 === 1) {
    return { bg: Theme.avatarSlate, text: Theme.avatarSlateText };
  }
  return { bg: Theme.avatarIndigo, text: Theme.avatarIndigoText };
}

export function EntityRow({
  title,
  subtitle,
  subtitleLeft,
  subtitleRight,
  amount,
  amountLabel,
  amountColor = 'default',
  rightAmountColor,
  onPress,
  avatarImage,
  rightAmount,
  rightAmountLabel,
  showAvatar = true,
  integrationStatus,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  entityType = 'client',
}: EntityRowProps) {
  const initial = getInitial(title);
  const avatar = getAvatarStyle();
  const partyAvatar = partyAvatarHasRenderableOutput({
    name: title,
    organizationImageUrl,
    avatarUrl,
    avatarSeed,
    entityType,
  });
  const amountStyle =
    amountColor === 'green' ? styles.amountPositive : amountColor === 'red' ? styles.amountNegative : styles.amountDefault;
  const labelStyle =
    amountColor === 'green' ? styles.amountLabelPositive : amountColor === 'red' ? styles.amountLabelNegative : styles.amountLabelDefault;
  const rightColor = rightAmountColor ?? amountColor;
  const rightAmountStyle =
    rightColor === 'green' ? styles.amountPositive : rightColor === 'red' ? styles.amountNegative : styles.amountDefault;
  const rightLabelStyle =
    rightColor === 'green' ? styles.amountLabelPositive : rightColor === 'red' ? styles.amountLabelNegative : styles.amountLabelDefault;

  const content = (
    <>
      {showAvatar && (
        <View style={[styles.avatar, { backgroundColor: avatarImage || partyAvatar ? Theme.screenBackground : avatar.bg }]}>
          {avatarImage ? (
            <Image source={avatarImage} style={styles.avatarImage} resizeMode="contain" />
          ) : partyAvatar ? (
            <PartyAvatar
              name={title}
              organizationImageUrl={organizationImageUrl}
              avatarUrl={avatarUrl}
              avatarSeed={avatarSeed}
              entityType={entityType}
              size={40}
            />
          ) : (
            <Text style={[styles.avatarText, { color: avatar.text }]}>{initial}</Text>
          )}
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {integrationStatus != null && (
            <View
              style={[
                styles.integrationPill,
                integrationStatus === 'integrated' ? styles.integrationPillIntegrated : styles.integrationPillOffline,
              ]}
            >
              <FontAwesome
                name={integrationStatus === 'integrated' ? 'link' : 'unlink'}
                size={10}
                color={integrationStatus === 'integrated' ? Theme.integratedIcon : Theme.nonIntegratedIcon}
                style={styles.integrationPillIcon}
              />
            </View>
          )}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {(subtitleLeft != null || subtitleRight != null) && (
          <View style={styles.subtitleSplitRow}>
            <Text style={[styles.subtitle, styles.subtitleLeft]} numberOfLines={1}>
              {subtitleLeft ?? ''}
            </Text>
            <Text style={[styles.subtitle, styles.subtitleRight]} numberOfLines={1}>
              {subtitleRight ?? ''}
            </Text>
          </View>
        )}
        {subtitle != null && subtitle !== '' && (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>
      {(amount != null || rightAmount != null) && (
        <View style={styles.rightBlock}>
          {amount != null && (
            <View style={styles.right}>
              <Text style={[styles.amount, amountStyle]}>{amount}</Text>
              {amountLabel != null && amountLabel !== '' && (
                <Text style={[styles.amountLabel, labelStyle]}>{amountLabel}</Text>
              )}
            </View>
          )}
          {rightAmount != null && (
            <View style={[styles.right, styles.rightSecond]}>
              <Text style={[styles.amount, rightAmountStyle]}>{rightAmount}</Text>
              {rightAmountLabel != null && rightAmountLabel !== '' && (
                <Text style={[styles.amountLabel, rightLabelStyle]}>{rightAmountLabel}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  avatarImage: {
    width: 28,
    height: 28,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.primaryText,
    flexShrink: 1,
    minWidth: 0,
  },
  integrationPill: {
    width: 16,
    height: 16,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  integrationPillIcon: {
    marginRight: 0,
  },
  integrationPillIntegrated: {},
  integrationPillOffline: {},
  subtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMutedDemo,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  subtitleSplitRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  subtitleLeft: {
    marginTop: 0,
    flex: 1,
    textAlign: 'left',
  },
  subtitleRight: {
    marginTop: 0,
    flex: 1,
    textAlign: 'right',
  },
  rightBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  right: {
    alignItems: 'flex-end',
  },
  rightSecond: {
    marginLeft: 0,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textBody,
  },
  amountDefault: {
    color: Theme.textBody,
  },
  amountPositive: {
    color: Theme.positive,
  },
  amountNegative: {
    color: Theme.negative,
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  amountLabelDefault: {
    color: Theme.textMutedDemo,
  },
  amountLabelPositive: {
    color: Theme.positive,
  },
  amountLabelNegative: {
    color: Theme.negative,
  },
});
