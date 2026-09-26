const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Raise every pod's IPHONEOS_DEPLOYMENT_TARGET to at least the app's minimum.
 *
 * Xcode 27 makes a pod target below iOS 15.0 a hard build error (it was a
 * warning before), and several pods still declare 9.0–13.4 in their specs
 * (GoogleSignIn, nanopb, PromisesObjC, RNSVG, AsyncStorage resource bundles…).
 * Pods only ever run inside this app, so building them at the app's minimum is
 * safe. Only raises, never lowers.
 */
module.exports = function withPodDeploymentTarget(config, { minimum = '16.4' } = {}) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');
      const result = mergeContents({
        tag: 'unifesto-pod-deployment-target',
        src: contents,
        newSrc: [
          '    installer.pods_project.targets.each do |t|',
          '      t.build_configurations.each do |bc|',
          "        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
          `        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${minimum}')`,
          `          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minimum}'`,
          '        end',
          '      end',
          '    end',
        ].join('\n'),
        anchor: /post_install do \|installer\|/,
        offset: 1,
        comment: '#',
      });
      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);
};
