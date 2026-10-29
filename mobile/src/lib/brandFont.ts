// Organiser white-label font (`branding.font`, a Google Fonts family name from
// backend BRAND_FONTS) for headings on space and event screens. Bundled faces
// load from assets; the rest load once from Google's versioned static TTFs via
// expo-font. Until a face is ready, or if it fails, callers get undefined and
// keep the app's own heading font.

import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { cosmosFont } from '../theme/cosmos';

const GSTATIC = 'https://fonts.gstatic.com/s/';

// 500 weight, matching the app's heading face. Keys mirror backend BRAND_FONTS values.
const SOURCES: Record<string, Font.FontSource> = {
  Inter: `${GSTATIC}inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.ttf`,
  'Space Grotesk': require('../../assets/fonts/space-grotesk/static/SpaceGrotesk_500Medium.ttf'),
  Poppins: `${GSTATIC}poppins/v24/pxiByp8kv8JHgFVrLGT9Z1xlEA.ttf`,
  Montserrat: `${GSTATIC}montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Hw5aX8.ttf`,
  'IBM Plex Sans': `${GSTATIC}ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD2FlDB6g9.ttf`,
  'Playfair Display': `${GSTATIC}playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vXDXbtY.ttf`,
  Lora: `${GSTATIC}lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787wsuxJBkqg.ttf`,
};

const familyName = (font: string) => `Brand-${font.replace(/\s+/g, '')}`;
const failed = new Set<string>();

/** Font family to set on brand headings, or undefined to keep the app font. */
export function useBrandFont(font: string | null | undefined): string | undefined {
  // DM Sans is already the app's headline font; no load needed.
  const bundled = font === 'DM Sans' ? cosmosFont.display.fontFamily : undefined;
  const source = font ? SOURCES[font] : undefined;
  const family = font ? familyName(font) : '';
  const [ready, setReady] = useState(() => !!source && Font.isLoaded(family));

  useEffect(() => {
    if (!source || failed.has(family)) return;
    if (Font.isLoaded(family)) {
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    Font.loadAsync({ [family]: source })
      .then(() => alive && setReady(true))
      .catch(() => {
        failed.add(family); // offline or blocked: stay on the app font
      });
    return () => {
      alive = false;
    };
  }, [source, family]);

  return bundled ?? (ready ? family : undefined);
}
