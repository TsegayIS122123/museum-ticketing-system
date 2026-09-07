'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { isStaff } from '@/lib/auth/roles';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { StaffSidebar } from '@/components/layout/StaffSidebar';
import { ProfilePage } from '@/components/account/ProfilePage';

// "Account settings (language, contact info)" -- Document 06 Sec 5.1
// (FR-LOC-001), route `/settings/account`, "All authenticated" roles.
//
// This is the ONLY account-settings route -- it replaces what used to be
// two separate role-specific routes ([lang]/profile/page.tsx for Visitor
// and [lang]/staff/profile/page.tsx for Staff), both thin wrappers
// around the same shared `ProfilePage` component (components/account/
// ProfilePage.tsx), which already branches its own field set on
// `user.role`. Those two routes have been deleted; every link that used
// to point at `/profile` or `/staff/profile` (StaffSidebar, SiteHeader's
// profile menu item) now points here instead.
//
// Chrome is intentionally duplicated rather than shared with
// [lang]/staff/layout.tsx: that layout guards every route under
// `/staff/*` and redirects non-staff away (see StaffLayout), which is
// exactly the restriction this role-agnostic route must NOT apply.
// Each branch below mirrors its respective former page's shell
// (StaffLayout's staff shell / the old visitor profile page's shell) so
// the rendered result is unchanged for either role.
export default function AccountSettingsPage() {
  const { user } = useAuth();

  if (user && isStaff(user.role)) {
    return (
      <div className="min-h-screen bg-stone-50" data-surface="staff">
        <SiteHeader />
        <div className="flex min-h-[calc(100vh-4rem)]">
          <StaffSidebar />
          <main className="flex-1 overflow-auto">
            <ProfilePage />
          </main>
        </div>
      </div>
    );
  }

  // Visitor chrome (and the not-yet-known-role loading instant before
  // `user` resolves) -- ProfilePage itself redirects to `/` if it turns
  // out nobody is actually authenticated, same as [lang]/profile/page.tsx.
  return (
    <div className="min-h-screen" data-surface="visitor">
      <SiteHeader />
      <div className="flex flex-1 flex-col">
        <ProfilePage />
      </div>
    </div>
  );
}
