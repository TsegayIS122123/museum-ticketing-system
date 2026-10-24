import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ZNHM Ticketing',
  slug: 'znhm-ticketing',
  scheme: 'znhm',
  version: '0.1.0',

  orientation: 'portrait',
  userInterfaceStyle: 'light',

  icon: './assets/app/icon.png',

  ios: {
    bundleIdentifier: 'et.aau.znhm.ticketing',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'ZNHM Ticketing uses the camera to scan a ticket QR code at the entrance gate.',
    },
  },
  android: {
    package: 'et.aau.znhm.ticketing',
    adaptiveIcon: {
      foregroundImage: './assets/app/android-icon-foreground.png',
      backgroundImage: './assets/app/android-icon-background.png',
      monochromeImage: './assets/app/android-icon-monochrome.png',
      backgroundColor: '#015484',
    },
    permissions: ['CAMERA'],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    display: 'standalone',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-font',
      {
        ios: {
          fonts: [
            './assets/fonts/NotoSansEthiopic-Regular.ttf',
            './assets/fonts/NotoSansEthiopic-Bold.ttf',
          ],
        },
        android: {
          fonts: [
            {
              fontFamily: 'NotoSansEthiopic',
              fontDefinitions: [
                { path: './assets/fonts/NotoSansEthiopic-Regular.ttf', weight: 400 },
                { path: './assets/fonts/NotoSansEthiopic-Bold.ttf', weight: 700 },
              ],
            },
          ],
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#015484',
        image: './assets/app/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    'expo-web-browser',
    'expo-sqlite',
    'expo-camera',
    'expo-sharing',
  ],
  extra: {
    router: {},
  },
};

export default config;