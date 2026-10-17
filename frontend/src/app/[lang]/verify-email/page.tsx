import { Suspense } from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { VerifyEmailForm } from '@/features/account/components/VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {/* VerifyEmailForm reads ?token= / ?redirect= via useSearchParams,
            which requires a Suspense boundary under the app router. */}
        <Suspense fallback={null}>
          <VerifyEmailForm />
        </Suspense>
      </main>
    </div>
  );
}
