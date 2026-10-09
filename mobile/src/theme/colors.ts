export const colors = {
  // Brand primary scale (web: #f1f7fb → #032133)
  primary50: '#F1F7FB',
  primary100: '#DFEFF8',
  primary200: '#B6DFF7',
  primary300: '#6EC5F7',
  primary400: '#06A0F9',
  primary500: '#0374B5',
  primary600: '#015484',
  primary700: '#014268',
  primary800: '#02324D',
  primary900: '#032133',

  // Semantic
  brandPrimary: '#015484',
  brandPrimaryDark: '#014268',
  brandPrimaryLight: '#DFEFF8',
  brandFooter: '#01324E',

  // Surfaces
  background: '#F7F5F0', // web surface-alt
  surface: '#FFFFFF',
  surfaceAlt: '#F7F5F0', // aligned — was #F1EFEA

  // Text
  text: '#1C1917',
  textMuted: '#6E6455', // aligned — was #6B7280
  textInverse: '#FFFFFF',

  // Border
  border: '#E8E4DE',

  // Feedback
  success: '#10B981',
  warning: '#0374B5', // aligned — web warning == primary
  danger: '#DC2626',
  focus: '#015484',

  // Accents (from web)
  sun: '#FFBE0B',
  sunDeep: '#FB9F0B',
  leaf: '#2FD29A',
  leafDeep: '#0FB27F',
  coral: '#FF6B6B',
  coralDeep: '#F2465A',
  sky: '#29C3F5',
  grape: '#9B6BFF',
} as const;

export type AppColor = keyof typeof colors;