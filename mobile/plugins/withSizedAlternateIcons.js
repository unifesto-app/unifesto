const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod } = require('expo/config-plugins');
const { generateImageAsync } = require('@expo/image-utils');

/**
 * Ship the iOS alternate app icons at the sizes iOS draws them, not 1024 px.
 *
 * expo-alternate-app-icons writes each one as a single-size 1024 icon set, and
 * actool keeps that 1024 image in Assets.car for iPhone and iPad: 0.9-1.7 MB per
 * icon (the gradient art barely compresses), 8 MB of every iPhone download in
 * 5.0.0 (40). Only the primary icon needs 1024 (the App Store marketing image),
 * so this rewrites each alternate set with the classic "All Sizes" list instead:
 * same art, same CFBundleAlternateIcons entry, ~0.1 MB per icon.
 *
 * Reads the icons from the expo-alternate-app-icons entry in app.config.js. Runs
 * after that plugin: wrappers applied in app.config.js run their mods after the
 * `plugins` array's.
 */
const SIZES = [
  // [idiom, points, scale]
  ['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3],
  ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
  ['ipad', 20, 1], ['ipad', 20, 2], ['ipad', 29, 1], ['ipad', 29, 2],
  ['ipad', 40, 1], ['ipad', 40, 2], ['ipad', 76, 2], ['ipad', 83.5, 2],
];

module.exports = function withSizedAlternateIcons(config) {
  const entry = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-alternate-app-icons');
  const icons = entry[1].filter((icon) => typeof icon.ios === 'string');
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const catalog = path.join(platformProjectRoot, IOSConfig.XcodeUtils.getProjectName(projectRoot), 'Images.xcassets');
      for (const { name, ios } of icons) {
        const dir = path.join(catalog, `${name}.appiconset`);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const images = [];
        for (const [idiom, points, scale] of SIZES) {
          const px = points * scale;
          const filename = `${name}-${px}.png`;
          if (!fs.existsSync(path.join(dir, filename))) {
            const { source } = await generateImageAsync(
              { projectRoot, cacheType: 'unifesto-alternate-icons' },
              // Icons must be opaque; the art already is, this just drops the alpha channel.
              { src: path.join(projectRoot, ios), name: filename, width: px, height: px, resizeMode: 'cover', removeTransparency: true, backgroundColor: '#000000' },
            );
            fs.writeFileSync(path.join(dir, filename), source);
          }
          images.push({ idiom, size: `${points}x${points}`, scale: `${scale}x`, filename });
        }
        fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({ images, info: { author: 'expo', version: 1 } }, null, 2));
      }
      return cfg;
    },
  ]);
};
