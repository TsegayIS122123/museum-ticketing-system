import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ZNHM Ticketing',
  slug: 'znhm-ticketing',
  scheme: 'znhm',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#015484',
  },
  ios: {
    bundleIdentifier: 'et.aau.znhm.ticketing',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'ZNHM Ticketing uses the camera to scan a ticket QR code at the entrance gate.',
      NSPhotoLibraryUsageDescription:
        'ZNHM Ticketing may save your ticket receipt to Photos when you choose to download it.',
    },
  },
  android: {
    package: 'et.aau.znhm.ticketing',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#015484',
    },
    permissions: ['CAMERA'],
  },
  web: {
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-camera', 'expo-sqlite'],
  extra: {
    router: {},
  },
};

export default config;
