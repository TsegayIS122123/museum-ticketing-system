import { Suspense } from 'react';
import { VisitorVerifyForm } from '@/features/account/components/VisitorVerifyForm';
import { PublicHeader } from '@/components/layout/PublicHeader';

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {/* VisitorVerifyForm reads ?redirect= via useSearchParams, which
            needs a Suspense boundary for static rendering. */}
        <Suspense fallback={null}>
          <VisitorVerifyForm />
        </Suspense>
      </main>
    </div>
  );
}
