const { withXcodeProject } = require('@expo/config-plugins');

/**
 * Repairs the Xcode project after onesignal-expo-plugin.
 *
 * OneSignal (dist/index.js, "PBXContainerItemProxy = PBXTargetDependency") points
 * the PBXContainerItemProxy section at the PBXTargetDependency dict. Any proxy
 * another plugin added before it (expo-widgets' ExpoWidgetsTarget) is lost, and
 * that target dependency is left pointing at nothing. Xcode shrugs it off, but
 * @bacons/apple-targets (the App Clip in targets/clip) crashes parsing it.
 *
 * Splits the aliased sections back apart and recreates any missing proxy.
 * Must be listed BEFORE onesignal-expo-plugin in app.config.js plugins: mods
 * run in reverse registration order, so that makes this one run after it.
 */
module.exports = function withXcodeDependencyProxyFix(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const objects = project.hash.project.objects;
    const deps = objects.PBXTargetDependency;
    if (!deps) return config;

    if (objects.PBXContainerItemProxy === deps) {
      const split = (isa) =>
        Object.fromEntries(
          Object.entries(deps).filter(([key, value]) => {
            const uuid = key.replace(/_comment$/, '');
            return deps[uuid] && deps[uuid].isa === isa && (value === isa || typeof value === 'object');
          }),
        );
      objects.PBXTargetDependency = split('PBXTargetDependency');
      objects.PBXContainerItemProxy = split('PBXContainerItemProxy');
    }

    const proxies = (objects.PBXContainerItemProxy ??= {});
    const nativeTargets = project.pbxNativeTargetSection();
    for (const dep of Object.values(objects.PBXTargetDependency)) {
      if (typeof dep !== 'object' || !dep.targetProxy || proxies[dep.targetProxy]) continue;
      proxies[dep.targetProxy] = {
        isa: 'PBXContainerItemProxy',
        containerPortal: project.hash.project.rootObject,
        containerPortal_comment: project.hash.project.rootObject_comment,
        proxyType: 1,
        remoteGlobalIDString: dep.target,
        remoteInfo: nativeTargets[dep.target]?.name,
      };
      proxies[`${dep.targetProxy}_comment`] = 'PBXContainerItemProxy';
    }
    return config;
  });
};
