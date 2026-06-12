import { ChatImage } from "@/features/chat/components/ChatImage";
import { SLACK_DESKTOP_AVATAR } from "@/features/chat/components/desktop/chatSlackDesktop.styles";
import { SLACK_AVATAR } from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { useChatMediaGallery } from "@/features/chat/components/shared/ChatMediaGalleryLightbox";
import type { ConversationImagePreview } from "@/features/chat/utils/conversationImagePreview.util";
import { chatGallerySlideFromInboxPreview } from "@/features/chat/utils/chatMediaGallery.util";
import { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

/** ~2 full thumbs + peek of a 3rd — side-scroll for the rest (matches thread burst strip). */
const THUMB_GAP = 8;
const VISIBLE_COLS = 2.5;
const MIN_THUMB_W = 104;
const MAX_THUMB_W = 156;
const THUMB_H = 96;

function InboxThumb({
  item,
  width,
  onPress,
}: {
  item: ConversationImagePreview;
  width: number;
  onPress: () => void;
}) {
  const radius = Math.max(8, Math.round(width * 0.1));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.thumbPressable,
        {
          width,
          height: THUMB_H,
          borderRadius: radius,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open image preview"
    >
      {item.storagePath ? (
        <View
          style={[
            styles.thumbShell,
            { width, height: THUMB_H, borderRadius: radius, overflow: "hidden" },
          ]}
        >
          <ChatImage
            storagePath={item.storagePath}
            thumbnail
            displayWidth={width}
            displayHeight={THUMB_H}
            style={{ width, height: THUMB_H, borderRadius: radius }}
          />
        </View>
      ) : (
        <Image
          source={{ uri: item.url }}
          style={[
            styles.thumbImage,
            { width, height: THUMB_H, borderRadius: radius },
          ]}
          resizeMode="cover"
        />
      )}
    </Pressable>
  );
}

export function ChatInboxImagePreviewStrip({
  items,
  variant = "mobile",
}: {
  items: ConversationImagePreview[];
  variant?: "mobile" | "desktop";
}) {
  const { width: screenWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const gallery = useChatMediaGallery();

  const slides = useMemo(
    () => items.map((item, index) => chatGallerySlideFromInboxPreview(item, index)),
    [items],
  );

  const thumbWidth = useMemo(() => {
    const horizontalPad = variant === "mobile" ? 12 * 2 : 10 * 2;
    const avatar = variant === "mobile" ? SLACK_AVATAR.list : SLACK_DESKTOP_AVATAR.sidebar;
    const gap = variant === "mobile" ? 8 : 10;
    const fallbackBodyWidth = screenWidth - horizontalPad - avatar - gap;
    const bodyWidth = measuredWidth > 0 ? measuredWidth : fallbackBodyWidth;
    const raw = Math.floor(
      (bodyWidth - THUMB_GAP * (VISIBLE_COLS - 1)) / VISIBLE_COLS,
    );
    return Math.max(MIN_THUMB_W, Math.min(MAX_THUMB_W, raw));
  }, [screenWidth, measuredWidth, variant]);

  if (items.length === 0) return null;

  const thumbs = items.map((item, index) => (
    <InboxThumb
      key={item.storagePath || item.url || String(index)}
      item={item}
      width={thumbWidth}
      onPress={() => gallery.open(slides, index)}
    />
  ));

  const onLayout = (width: number) => {
    if (width > 0 && Math.abs(width - measuredWidth) > 1) {
      setMeasuredWidth(width);
    }
  };

  const strip = (
    <View onLayout={(e) => onLayout(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { gap: THUMB_GAP }]}
        scrollEnabled={items.length > 1}
      >
        {thumbs}
      </ScrollView>
    </View>
  );

  return (
    <>
      {strip}
      {gallery.node}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginTop: 6,
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  thumbPressable: {
    overflow: "hidden",
  },
  thumbShell: {
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D5DB",
  },
  thumbImage: {
    backgroundColor: "#E5E7EB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D5DB",
  },
});
