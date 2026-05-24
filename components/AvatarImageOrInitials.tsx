/**
 * Profile chrome avatar — preset/uploaded image, or coloured initials circle.
 */
import { partyAvatarInitialsTextColor } from '@/lib/partyAvatarDisplay';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type AvatarImageOrInitialsProps = {
  uri?: string | null;
  initials: string;
  initialsColor: string;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AvatarImageOrInitials({
  uri,
  initials,
  initialsColor,
  containerStyle,
  imageStyle,
  textStyle,
}: AvatarImageOrInitialsProps) {
  if (uri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri }}
          style={[styles.fill, imageStyle]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  const textColor = partyAvatarInitialsTextColor(initialsColor);

  return (
    <View style={[containerStyle, { backgroundColor: initialsColor }]}>
      <Text style={[textStyle, { color: textColor }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
});
