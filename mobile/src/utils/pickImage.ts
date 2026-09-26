import * as ImagePicker from 'expo-image-picker';
import { openImageCropper } from '../components/ui/ImageCropper';

type ManipulatorModule = typeof import('expo-image-manipulator');

// Lazy + guarded: a dev client built before expo-image-manipulator was added
// has no native module, and a top-level import would crash the whole screen.
let manipulator: ManipulatorModule | null | undefined;
function loadManipulator(): ManipulatorModule | null {
  if (manipulator === undefined) {
    try {
      manipulator = require('expo-image-manipulator') as ManipulatorModule;
    } catch {
      manipulator = null;
    }
  }
  return manipulator;
}

/** Longest edge we upload for a cropped image; keeps covers well under the 10 MB API cap. */
const MAX_WIDTH = 1600;

/**
 * Pick a library image at exactly `aspect` (e.g. [4, 3]), framed by the user.
 *
 * expo-image-picker's `aspect` is Android-only: the iOS editor always crops
 * square. Square images keep the system editor; anything else opens our own
 * move-and-scale cropper (<ImageCropHost />) and is cut with expo-image-manipulator.
 *
 * Returns the local URI of the result, or null if cancelled.
 */
export async function pickImageAtAspect(aspect: [number, number], quality = 0.85): Promise<string | null> {
  const square = aspect[0] === aspect[1];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: square,
    aspect,
    quality: square ? quality : 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  if (square) return res.assets[0].uri;

  const mod = loadManipulator();
  if (!mod) {
    // Stale build without the native module: no way to crop, so say so rather than upload a huge original.
    throw new Error('Update the app to crop images');
  }

  const ctx = mod.ImageManipulator.manipulate(res.assets[0].uri);
  // Render once for the true (EXIF-oriented) pixel size the crop rect is measured in.
  const original = await ctx.renderAsync();
  const rect = await openImageCropper(res.assets[0].uri, original.width, original.height, aspect[0] / aspect[1]);
  if (!rect) return null;

  ctx.crop(rect);
  if (rect.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ compress: quality, format: mod.SaveFormat.JPEG });
  return saved.uri;
}
