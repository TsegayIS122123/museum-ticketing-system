import { Suspense } from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { VerifyEmailStatus } from '@/features/account/components/VerifyEmailStatus';

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {/* useSearchParams() requires a Suspense boundary in the app router */}
        <Suspense fallback={null}>
          <VerifyEmailStatus />
        </Suspense>
      </main>
    </div>
  );
}
