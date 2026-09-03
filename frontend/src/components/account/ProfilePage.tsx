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

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setPhone(user.phone ?? '');
    setLanguage(user.language_preference);
  }, [user]);

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
        <h1 className="font-serif text-3xl text-stone-900">{t('profile') || 'Profile'}</h1>
        <p className="mt-1 text-stone-500">{t('profile_description') || 'Manage your account details and language.'}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg bg-white p-6 shadow-sm">
        <TextField id="profile-name" label={t('full_name') || 'Full name'} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        <TextField id="profile-email" label={t('email') || 'Email'} value={user.email} disabled />
        {user.role === 'visitor' ? (
          <TextField id="profile-phone" label={t('phone') || 'Phone'} value={phone} onChange={(event) => setPhone(event.target.value)} />
        ) : (
          <div className="text-sm text-stone-700"><span className="font-medium">{t('role') || 'Role'}:</span> {getRoleDisplayName(user.role)}</div>
        )}
        <label className="block text-sm font-medium text-stone-700" htmlFor="profile-language">
          {t('language') || 'Language'}
          <select id="profile-language" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'am')} className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2">
            <option value="en">English</option>
            <option value="am">አማርኛ</option>
          </select>
        </label>
        <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : t('save_changes') || 'Save changes'}</Button>
      </form>
    </PageContainer>
  );
}
