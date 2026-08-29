import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
