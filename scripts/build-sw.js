const { injectManifest } = require('workbox-build');

async function buildServiceWorker() {
  try {
    const { count, size, warnings } = await injectManifest({
      swSrc: 'sw.js',
      swDest: 'dist/sw.js',
      globDirectory: 'dist',
      globPatterns: ['**/*.{html,js,css,svg,png,jpg,jpeg,webp,ico,json}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    });

    if (warnings && warnings.length > 0) {
      warnings.forEach((warning) => console.warn(warning));
    }

    console.log(`Service worker generated. ${count} files will be precached, totalling ${size} bytes.`);
  } catch (error) {
    console.error('Service worker generation failed:', error);
    process.exit(1);
  }
}

buildServiceWorker();
