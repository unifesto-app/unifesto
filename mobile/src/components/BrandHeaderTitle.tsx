import React from 'react';
import { Image } from 'expo-image';
import type { Branding } from '../lib/api/events';

/**
 * The organiser's logo in place of the stack header title on a white-labelled
 * space or event page. Wide wordmarks and square logos both fit the box.
 */
export default function BrandHeaderTitle({ logoUrl, name }: { logoUrl: string; name?: string | null }) {
  return (
    <Image
      source={{ uri: logoUrl }}
      style={{ width: 140, height: 28 }}
      contentFit="contain"
      accessibilityLabel={name || 'Organiser logo'}
      accessibilityRole="header"
    />
  );
}

/**
 * Header options for a branded page: the logo as title when the space theme
 * is live (`name` set), else undefined so the screen keeps its default title.
 */
export function brandHeaderOptions(branding: Branding | null | undefined) {
  const logoUrl = branding?.name ? branding.logoUrl : null;
  return {
    headerTitle: logoUrl ? () => <BrandHeaderTitle logoUrl={logoUrl} name={branding?.name} /> : undefined,
  };
}
