import { Suspense } from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { SignInForm } from '@/features/account/components/SignInForm';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {/* SignInForm reads ?redirect= via useSearchParams, which requires a
            Suspense boundary for static rendering. */}
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  );
}
