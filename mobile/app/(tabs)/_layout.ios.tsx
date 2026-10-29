import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { cosmosFont, useCosmos } from '../../src/theme/cosmos';
import { useSpaceAccess } from '../../src/context/SpaceAccessContext';
import usePlatformAdmin from '../../src/hooks/usePlatformAdmin';

// iOS: the system tab bar (Liquid Glass on iOS 26+). It floats over content,
// shrinks while scrolling down and returns on scroll up. Icons are plain SF
// Symbols — no custom backgrounds behind them.
export default function TabsLayout() {
  // Monochrome cosmos: silver selected, muted idle (matches Home/Tickets/Profile).
  const c = useCosmos();
  // Operators only (Space Admin, Curator, Co-Curator, Crew, Judge, Mentor).
  const { sections } = useSpaceAccess();
  // Unifesto platform staff only.
  const isPlatformAdmin = usePlatformAdmin();

  return (
    <NativeTabs
      tintColor={c.primary}
      iconColor={{ default: c.muted, selected: c.primary }}
      labelStyle={{
        default: { fontFamily: cosmosFont.strong.fontFamily, fontSize: 10, color: c.muted },
        selected: { fontFamily: cosmosFont.strong.fontFamily, fontSize: 10, color: c.primary },
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
