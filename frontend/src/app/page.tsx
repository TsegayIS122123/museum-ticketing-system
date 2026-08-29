import { redirect } from 'next/navigation';

// Root page redirects to /en (handled by middleware)
export default function RootPage() {
  redirect('/en');
}
