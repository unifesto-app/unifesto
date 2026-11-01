const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Mark output-less Run Script phases "always run" to silence Xcode's
 * "Script has ambiguous dependencies causing it to run on every build".
 *
 * A phase with no outputs already runs on every build; Xcode only warns until
 * that is explicit (alwaysOutOfDate = 1, i.e. "Based on dependency analysis"
 * unchecked), so this changes no behaviour. Four phases trip it: Sentry's
 * debug-symbol upload, Expo Dev Launcher's local-network-key strip, and React
 * Native Firebase's Core and Crashlytics configuration. The RNFB ones only
 * appear when CocoaPods integrates the project, hence post_integrate.
 */
module.exports = function withAlwaysRunScripts(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');
      const result = mergeContents({
        tag: 'unifesto-always-run-scripts',
        src: contents,
        newSrc: [
          '  post_integrate do |installer|',
          '    installer.aggregate_targets.map(&:user_project).uniq.each do |project|',
          '      phases = project.targets.flat_map(&:shell_script_build_phases).select do |p|',
          "        p.always_out_of_date != '1' && Array(p.output_paths).empty? && Array(p.output_file_list_paths).empty?",
          '      end',
          '      next if phases.empty?',
          "      phases.each { |p| p.always_out_of_date = '1' }",
          '      project.save',
          '    end',
          '  end',
        ].join('\n'),
        anchor: /post_install do \|installer\|/,
        offset: 0,
        comment: '#',
      });
      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);
};
