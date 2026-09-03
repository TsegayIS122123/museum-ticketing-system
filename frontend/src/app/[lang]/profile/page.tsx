'use client';

import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProfilePage } from '@/components/account/ProfilePage';
import { VisitorSidebar } from '@/components/layout/VisitorSidebar';

export default function VisitorProfilePage() {
  return (
    <div className="min-h-screen" data-surface="visitor">
      <SiteHeader />
      <div className="flex flex-1">
        <VisitorSidebar />
        <ProfilePage />
      </div>
    </div>
  );
}
