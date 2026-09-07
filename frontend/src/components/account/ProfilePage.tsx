'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { getRoleDisplayName } from '@/lib/auth/roles';
import { updateCurrentUser } from '@/features/account/api';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { Select } from '@/components/ui/Select';

export function ProfilePage() {
  const { t, locale } = useTranslation();
  const { user, setUser, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<'en' | 'am'>(locale);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push(`/${locale}/`);
  }, [isAuthenticated, isLoading, locale, router]);

  // Reset the editable form fields whenever the source-of-truth `user`
  // object changes identity (first load, or a fresh object after a save)
  // -- adjusted during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  //
  // `prevUser` is deliberately seeded with `null`, NOT `user`: if `user`
  // is already populated when this component first mounts (e.g. you
  // navigate here client-side while already authenticated, rather than
  // landing here via a fresh page load), seeding with `user` would make
  // `prevUser` equal to `user` on that very first render, so the
  // `user !== prevUser` check below would never fire and fullName/phone
  // would stay stuck at their empty-string defaults -- exactly the "only
  // email is filled in" bug this fixes. Seeding with `null` guarantees a
  // real, already-loaded user is always detected as a change.
  const [prevUser, setPrevUser] = useState<typeof user>(null);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone ?? '');
      setLanguage(user.language_preference);
    }
  }

  if (isLoading || !isAuthenticated || !user) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await updateCurrentUser({
        full_name: fullName,
        phone: phone || null,
        language_preference: language,
      });
      setUser(updated);
      setToast({ message: t('profile_updated') || 'Profile updated successfully.', type: 'success' });
    } catch (error: any) {
      setToast({ message: error.message || 'Could not update your profile.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer maxWidth="md">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-6">
        <h1 className="font-serif font-semibold text-3xl text-stone-900">{t('profile') || 'Profile'}</h1>
        <p className="mt-1 text-stone-500">{t('profile_description') || 'Manage your account details and language.'}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-stone-200 bg-white p-4 sm:p-6 shadow-sm">
        <TextField id="profile-name" label={t('full_name') || 'Full name'} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        <TextField id="profile-email" label={t('email') || 'Email'} value={user.email} disabled />
        {user.role === 'visitor' ? (
          <TextField id="profile-phone" label={t('phone') || 'Phone'} value={phone} onChange={(event) => setPhone(event.target.value)} />
        ) : (
          <div className="text-sm text-stone-700"><span className="font-medium">{t('role') || 'Role'}:</span> {getRoleDisplayName(user.role, t)}</div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-stone-700" htmlFor="profile-language">
            {t('language') || 'Language'}
          </label>
          <Select
            id="profile-language"
            value={language}
            onChange={(value) => setLanguage(value as 'en' | 'am')}
            options={[
              { value: 'en', label: t('english') || 'English' },
              { value: 'am', label: t('amharic') || 'አማርኛ' },
            ]}
          />
        </div>
        <Button type="submit" disabled={isSaving}>{isSaving ? t('saving') || 'Saving...' : t('save_changes') || 'Save changes'}</Button>
      </form>
    </PageContainer>
  );
}
