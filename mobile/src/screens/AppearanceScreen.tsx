import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Check, DeviceMobile, Moon, Sun } from 'phosphor-react-native';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import useTopSpacing from '../hooks/useTopSpacing';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const OPTIONS: { key: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { key: 'system', label: 'System default', Icon: DeviceMobile },
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
];

export default function AppearanceScreen() {
  const { theme, activeTheme, setTheme, tokens } = useTheme();
  const topSpacing = useTopSpacing();

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <SettingsGroup title="Theme">
        {OPTIONS.map(({ key, label, Icon }) => {
          const selected = theme === key;
          return (
            <SettingsRow
              key={key}
              icon={<Icon size={24} color={selected ? tokens.accent : tokens.textSecondary} weight={selected ? 'fill' : 'regular'} />}
              label={label}
              value={key === 'system' ? (activeTheme === 'dark' ? 'Dark now' : 'Light now') : undefined}
              trailing={selected ? <Check size={18} color={tokens.accent} weight="bold" /> : <></>}
              onPress={() => setTheme(key)}
            />
          );
        })}
      </SettingsGroup>

      <Text style={[styles.note, { color: tokens.textMuted }]}>
        System default follows your phone's setting and switches automatically.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[6], paddingBottom: 100 },
  note: {
    marginTop: spacing[3],
    marginHorizontal: spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...font(),
  },
});
