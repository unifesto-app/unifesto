import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { MenuView, type MenuAction } from '@react-native-menu/menu';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  BellSimple,
  CalendarPlus,
  DotsThree,
  DownloadSimple,
  Flag,
  Globe,
  Lifebuoy,
  LinkSimple,
  ShareNetwork,
  SignOut,
  Trash,
  type Icon,
} from '@unifesto/unicon/react-native';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CardBackdrop, CardSurfaceProvider } from '../components/ui/CardSurface';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import Modal from '../components/ui/Modal';

/**
 * Right-side header actions, shared by every pushed screen so spacing is the
 * same everywhere: 40pt tap targets, a clear gap between them, and a little
 * breathing room from the screen edge (and from the iOS 26 glass capsule).
 */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** A bare header icon with a comfortable tap area. */
export function HeaderIconButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.icon, { opacity: pressed ? 0.6 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export interface HeaderMenuItem {
  id: string;
  title: string;
  /**
   * SF Symbol name (iOS native menu), an Android drawable name (kept for the
   * native menu API) and the Phosphor glyph the Android dropdown draws.
   */
  icon: { ios: string; android: string; glyph?: Icon };
  destructive?: boolean;
}

interface MenuTrigger {
  /** Replaces the ⋯ glyph (e.g. a filter button beside a search field). */
  trigger?: React.ReactNode;
  triggerStyle?: StyleProp<ViewStyle>;
  label?: string;
}

/**
 * The ⋯ overflow menu. iOS keeps the native UIMenu (SF Symbols, system look).
 * Android draws its own dropdown in the app's style: the stock popup looked
 * generic next to the rest of the UI.
 */
export function HeaderMenu({
  title,
  items,
  onSelect,
  trigger,
  triggerStyle = styles.icon,
  label = 'More options',
}: {
  title: string;
  items: HeaderMenuItem[];
  onSelect: (id: string) => void;
} & MenuTrigger) {
  const c = useCosmos();
  if (Platform.OS === 'android') {
    return <AndroidMenu title={title} items={items} onSelect={onSelect} trigger={trigger} triggerStyle={triggerStyle} label={label} />;
  }

  const actions: MenuAction[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    image: item.icon.ios,
    imageColor: item.destructive ? c.danger : c.text,
    attributes: item.destructive ? { destructive: true } : undefined,
  }));

  return (
    <MenuView
      title={title}
      actions={actions}
      shouldOpenOnLongPress={false}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
    >
      <View style={triggerStyle} pointerEvents="none" accessibilityLabel={label}>
        {trigger ?? <DotsThree size={26} color={c.text} weight="bold" />}
      </View>
    </MenuView>
  );
}

/** Android: a glass dropdown (solid base + veil) anchored under the ⋯ button. */
function AndroidMenu({
  title,
  items,
  onSelect,
  trigger,
  triggerStyle,
  label,
}: {
  title: string;
  items: HeaderMenuItem[];
  onSelect: (id: string) => void;
} & MenuTrigger) {
  const c = useCosmos();
  const { width } = useWindowDimensions();
  const buttonRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const progress = useSharedValue(0);

  const open = () => {
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 4, right: Math.max(spacing[3], width - (x + w)) });
      progress.value = 0;
      progress.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
    });
  };

  const close = (after?: () => void) => {
    progress.value = withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) });
    setTimeout(() => {
      setAnchor(null);
      after?.();
    }, 130);
  };

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }, { translateY: (1 - progress.value) * -6 }],
  }));

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={open}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [triggerStyle, { opacity: pressed ? 0.6 : 1 }]}
      >
        {trigger ?? <DotsThree size={26} color={c.text} weight="bold" />}
      </Pressable>

      <Modal visible={!!anchor} transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close menu" />
        {anchor ? (
          <Animated.View
            style={[
              styles.menu,
              { top: anchor.top, right: anchor.right, transformOrigin: 'top right', borderColor: c.border },
              cardStyle,
            ]}
          >
            <CardSurfaceProvider kind="glass">
              <CardBackdrop shape={styles.menu} opaque />
            </CardSurfaceProvider>
            {title ? (
              <Text style={[styles.menuTitle, { color: c.muted }]} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {items.map((item) => {
              const color = item.destructive ? c.danger : c.text;
              const Glyph = item.icon.glyph;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => close(() => onSelect(item.id))}
                  android_ripple={{ color: c.tint }}
                  accessibilityRole="menuitem"
                  style={styles.menuItem}
                >
                  {Glyph ? <Glyph size={22} color={color} weight="regular" /> : <View style={{ width: 22 }} />}
                  <Text style={[styles.menuText, { color }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

/** Icons reused across screens' menus. */
export const MENU_ICONS = {
  share: { ios: 'square.and.arrow.up', android: 'ic_menu_share', glyph: ShareNetwork },
  copyLink: { ios: 'link', android: 'ic_menu_attachment', glyph: LinkSimple },
  calendar: { ios: 'calendar.badge.plus', android: 'ic_menu_my_calendar', glyph: CalendarPlus },
  notify: { ios: 'bell', android: 'ic_popup_reminder', glyph: BellSimple },
  report: { ios: 'exclamationmark.bubble', android: 'ic_dialog_alert', glyph: Flag },
  help: { ios: 'lifepreserver', android: 'ic_menu_help', glyph: Lifebuoy },
  download: { ios: 'arrow.down.circle', android: 'ic_menu_save', glyph: DownloadSimple },
  website: { ios: 'safari', android: 'ic_menu_view', glyph: Globe },
  leave: { ios: 'rectangle.portrait.and.arrow.right', android: 'ic_menu_close_clear_cancel', glyph: SignOut },
  delete: { ios: 'trash', android: 'ic_menu_delete', glyph: Trash },
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Room between the last icon and the screen edge / glass capsule edge.
    paddingHorizontal: Platform.OS === 'ios' ? 6 : 4,
  },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    minWidth: 220,
    maxWidth: 300,
    borderRadius: cosmosCardRadius,
    paddingVertical: spacing[2],
    overflow: 'hidden',
    // Frosted glass, no shadow; a hairline keeps the edge over a white page.
    borderWidth: StyleSheet.hairlineWidth,
  },
  menuTitle: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
    paddingBottom: spacing[2],
    fontSize: typography.fontSize.sm,
    ...cosmosFont.strong,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: 48, paddingHorizontal: spacing[4] },
  menuText: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
