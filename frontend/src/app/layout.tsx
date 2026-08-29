// This is a minimal root layout that just passes through to [lang]/layout.tsx
// The actual HTML rendering happens in app/[lang]/layout.tsx

import { ReactNode } from 'react';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
