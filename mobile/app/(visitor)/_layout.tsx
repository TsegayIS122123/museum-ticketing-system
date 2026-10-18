import { Stack } from 'expo-router';

// The visitor group is PUBLIC: the home screen is the app's landing page, so a
// signed-out visitor can open the app, see the hero, and choose "Book a visit"
// or "Sign in" -- the same first screen the web app shows. Everything that
// actually needs an account (tickets, profile, the booking wizard, payment, a
// booking detail) guards itself with <RequireRole role="visitor"> instead of
// the whole group being walled off here.
export default function VisitorLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
