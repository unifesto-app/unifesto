const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * C14: store builds need the production APNs entitlement. expo-widgets always
 * writes aps-environment "development" (even with its push option off) and
 * expo-notifications only fills it in when unset; OneSignal's plugin used to
 * overwrite it. Dev builds still work: the app reports the environment it
 * really got (expo-application) and the backend sends to that one.
 */
const withApsProduction = (config) =>
  withEntitlementsPlist(config, (mod) => {
    mod.modResults['aps-environment'] = 'production';
    return mod;
  });

module.exports = withApsProduction;
