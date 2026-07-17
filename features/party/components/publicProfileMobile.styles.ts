/**
 * Enterprise mobile tokens for party public preview screens
 * (client / supplier / driver `/public-profile/*`).
 */
import Layout from '@/constants/Layout';
import { StyleSheet } from 'react-native';

const GUTTER = Layout.screenPaddingHorizontal;

export const publicProfileMobileStyles = StyleSheet.create({
  heroShell: {
    paddingHorizontal: GUTTER,
    paddingBottom: 6,
  },
  heroTopBar: {
    marginBottom: 6,
  },
  heroChipBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  heroCardWrap: {
    borderRadius: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  content: {
    paddingHorizontal: GUTTER,
    paddingTop: 0,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 8,
    letterSpacing: 1.2,
    paddingHorizontal: 0,
    marginBottom: -2,
  },
  bioCard: {
    borderRadius: 12,
    padding: 12,
  },
  bioQuoteMark: {
    fontSize: 28,
    lineHeight: 22,
    marginBottom: 2,
  },
  bioText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  factList: {
    borderRadius: 12,
  },
  factRow: {
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  factIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  factLabel: {
    fontSize: 8,
    letterSpacing: 1.1,
    marginBottom: 1,
  },
  factValue: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  synergyCard: {
    borderRadius: 14,
    padding: 14,
  },
  synergyHeadline: {
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 4,
  },
  synergyBody: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 12,
  },
  synergyCta: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
  },
  synergyCtaText: {
    fontSize: 10,
    letterSpacing: 1.6,
  },
  fleetCta: {
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  fleetCtaTitle: {
    fontSize: 11,
    letterSpacing: 1.1,
  },
  fleetCtaBody: {
    fontSize: 10,
    lineHeight: 14,
  },
  errorTitle: {
    fontSize: 11,
    letterSpacing: 1.4,
  },
  errorBody: {
    fontSize: 13,
    lineHeight: 18,
  },
});

export const publicProfileInviteCompact = StyleSheet.create({
  card: {
    borderRadius: 12,
    width: '100%',
  },
  inviteCover: {
    height: 58,
  },
  inviteBody: {
    minHeight: 96,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 3,
  },
  avatarLift: {
    marginTop: -28,
  },
  name: {
    fontSize: 12,
    lineHeight: 15,
  },
  subtitle: {
    fontSize: 8,
    lineHeight: 11,
  },
  statsBand: {
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 9,
  },
  statCell: {
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  statLabel: {
    fontSize: 6,
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 10,
    lineHeight: 12,
  },
  roleBadgeText: {
    fontSize: 7,
  },
  statusPillText: {
    fontSize: 7,
  },
  metaChipText: {
    fontSize: 7,
  },
  phoneBandValue: {
    fontSize: 11,
  },
});
