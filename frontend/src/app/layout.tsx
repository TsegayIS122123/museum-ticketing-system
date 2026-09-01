import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-stone-50">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}