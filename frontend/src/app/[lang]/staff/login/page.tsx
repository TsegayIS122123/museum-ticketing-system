import { StaffLoginForm } from '@/features/account/components/StaffLoginForm';
import { PublicHeader } from '@/components/layout/PublicHeader';

export default function StaffLoginPage() {
  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <StaffLoginForm />
      </main>
    </div>
  );
}
