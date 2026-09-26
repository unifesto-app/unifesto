import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/context/ThemeContext';
import { useSpaceAccess } from '../../src/context/SpaceAccessContext';
import usePlatformAdmin from '../../src/hooks/usePlatformAdmin';
import { FONT_BODY_MEDIUM } from '../../src/theme/typography';

// iOS: the system tab bar (Liquid Glass on iOS 26+). It floats over content,
// shrinks while scrolling down and returns on scroll up. Icons are plain SF
// Symbols — no custom backgrounds behind them.
export default function TabsLayout() {
  // Status bar + native Appearance are driven by ThemeProvider.
  const { tokens } = useTheme();
  // Operators only (Space Admin, Curator, Co-Curator, Crew, Judge, Mentor).
  const { sections } = useSpaceAccess();
  // Unifesto platform staff only.
  const isPlatformAdmin = usePlatformAdmin();

  return (
    <NativeTabs
      tintColor={tokens.accent}
      iconColor={{ default: tokens.textMuted, selected: tokens.accent }}
      labelStyle={{
        default: { fontFamily: FONT_BODY_MEDIUM, fontSize: 10, color: tokens.textMuted },
        selected: { fontFamily: FONT_BODY_MEDIUM, fontSize: 10, color: tokens.accent },
      }}
      minimizeBehavior="onScrollDown"
    >
      {/* Icon-only tabs: labels are hidden but kept for VoiceOver. */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label hidden>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tickets">
        <NativeTabs.Trigger.Icon sf={{ default: 'ticket', selected: 'ticket.fill' }} />
        <NativeTabs.Trigger.Label hidden>Tickets</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="space" hidden={sections.length === 0}>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        <NativeTabs.Trigger.Label hidden>Space</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="apex" hidden={!isPlatformAdmin}>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.shield', selected: 'checkmark.shield.fill' }} />
        <NativeTabs.Trigger.Label hidden>Apex</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label hidden>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
