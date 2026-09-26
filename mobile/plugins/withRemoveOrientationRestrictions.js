const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemoveOrientationRestrictions(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;

    // Ensure xmlns:tools is defined
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application[0];
    const activities = application.activity || [];

    // Add ML Kit Barcode Scanner activity override
    const mlkitActivity = {
      $: {
        'android:name': 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity',
        'android:screenOrientation': 'unspecified',
        'tools:replace': 'android:screenOrientation',
      },
    };

    // Add Razorpay Checkout activity override
    const razorpayActivity = {
      $: {
        'android:name': 'com.razorpay.BaseCheckoutActivity',
        'android:screenOrientation': 'unspecified',
        'tools:replace': 'android:screenOrientation',
      },
    };

    // Push the activity overrides to the manifest
    application.activity = [...activities, mlkitActivity, razorpayActivity];

    return config;
  });
};
