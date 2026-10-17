/**
 * Every bundled asset used by the mobile app, exported from one registry so
 * components never scatter require() paths. Paths are relative to this file
 * (resolved by Metro at build time).
 */
export const ASSETS = {
  brand: {
    aauLogo: require('../../assets/brand/aau-logo.png'),
  },
  images: {
    heroWaliaIbex: require('../../assets/images/hero-walia-ibex.jpg'),
  },
  app: {
    icon: require('../../assets/app/icon.png'),
    splashIcon: require('../../assets/app/splash-icon.png'),
    favicon: require('../../assets/app/favicon.png'),
    androidIconBackground: require('../../assets/app/android-icon-background.png'),
    androidIconForeground: require('../../assets/app/android-icon-foreground.png'),
    androidIconMonochrome: require('../../assets/app/android-icon-monochrome.png'),
  },
} as const;