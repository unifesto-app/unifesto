const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Q40: Razorpay's Apple Pay plugin pod. react-native-customui looks it up at
 * runtime (NSClassFromString), so linking it into the app target is all it
 * needs; without it the app reports Apple Pay as unavailable.
 */
module.exports = function withRazorpayApplePay(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const result = mergeContents({
        tag: 'unifesto-razorpay-applepay',
        src: fs.readFileSync(podfile, 'utf8'),
        newSrc: "  pod 'razorpay-applepay-pod', '~> 1.0.1'",
        anchor: /use_expo_modules!/,
        offset: 1,
        comment: '#',
      });
      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);
};
