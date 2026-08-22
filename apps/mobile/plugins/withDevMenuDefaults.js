const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = (config) => withAndroidManifest(config, (nextConfig) => {
  const application = nextConfig.modResults.manifest.application?.[0];
  if (!application) return nextConfig;

  application['meta-data'] ??= [];
  const name = 'EXDevMenuShowFloatingActionButton';
  const existing = application['meta-data'].find((item) => item.$?.['android:name'] === name);
  if (existing) {
    existing.$['android:value'] = 'false';
  } else {
    application['meta-data'].push({
      $: {
        'android:name': name,
        'android:value': 'false',
      },
    });
  }

  return nextConfig;
});
