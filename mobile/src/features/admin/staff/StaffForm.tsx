import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing, typography } from '@/theme';
import {
  useStaffMutations,
  type StaffAccount,
} from '@/api/queries/admin-staff';
import { isApiError } from '@/api/errors';

type Role = 'cashier' | 'museum_manager';

interface StaffFormProps {
  visible: boolean;
  editing: StaffAccount | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function StaffForm({ visible, editing, onClose, onSaved }: StaffFormProps) {
  const { t } = useTranslation();
  const { create, update, deactivate } = useStaffMutations();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (editing) {
      setFullName(editing.full_name);
      setEmail(editing.email);
      setPhone(editing.phone ?? '');
      setRole(
        editing.role === 'platform_admin' ? 'cashier' : (editing.role as Role)
      );
      setActive(editing.active);
      setPassword('');
    } else {
      setFullName('');
      setEmail('');
      setPhone('');
      setRole('cashier');
      setActive(true);
      setPassword('');
    }
  }, [editing, visible]);

  const handleSubmit = async () => {
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: {
            full_name: fullName.trim(),
            phone: phone.trim() || undefined,
            role,
            active,
          },
        });
      } else {
        if (!email.trim() || password.length < 6) {
          Alert.alert(
            t('commonErrorGeneric', 'Something went wrong'),
            t('validationEmailPassword', 'Enter a valid email and a password of at least 6 characters.')
          );
          return;
        }
        await create.mutateAsync({
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
          role,
          password,
        });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('saveFailed', 'Save failed'), msg);
    }
  };

  const handleDeactivate = () => {
    if (!editing) return;
    Alert.alert(
      t('deactivateStaffTitle', 'Deactivate this staff account?'),
      t('deactivateStaffBody', 'The staff member will no longer be able to log in.'),
      [
        { text: t('back', 'Cancel'), style: 'cancel' },
        {
          text: t('deactivate', 'Deactivate'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivate.mutateAsync(editing.id);
              onSaved?.();
              onClose();
            } catch (err) {
              const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
              Alert.alert(t('deactivateFailed', 'Deactivate failed'), msg);
            }
          },
        },
      ]
    );
  };

  const busy = create.isPending || update.isPending || deactivate.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <Text style={styles.title}>
            {editing ? t('editStaff', 'Edit staff account') : t('addStaff', 'New staff account')}
          </Text>

          <TextField
            label={t('fullName', 'Full name')}
            value={fullName}
            onChangeText={setFullName}
          />

          <TextField
            label={t('email', 'Email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!editing}
          />

          <TextField
            label={t('phone', 'Phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {!editing ? (
            <TextField
              label={t('password', 'Temporary password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          ) : null}

          <View style={styles.roleRow}>
            <Text style={styles.roleLabel}>{t('role', 'Role')}</Text>
            <View style={styles.rolePills}>
              {(['cashier', 'museum_manager'] as Role[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[styles.pill, role === r && styles.pillActive]}
                >
                  <Text style={[styles.pillText, role === r && styles.pillTextActive]}>
                    {r === 'cashier' ? t('roleCashier', 'Cashier') : t('roleMuseumManager', 'Museum Manager')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {editing ? (
            <View style={styles.activeRow}>
              <Text style={styles.roleLabel}>{t('active', 'Active')}</Text>
              <Pressable
                onPress={() => setActive(!active)}
                style={[styles.toggle, active && styles.toggleOn]}
              >
                <Text style={styles.toggleText}>{active ? 'On' : 'Off'}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={t('back', 'Cancel')} variant="secondary" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={busy ? t('loading', 'Loading…') : t('save', 'Save')}
                onPress={handleSubmit}
                loading={busy}
              />
            </View>
          </View>

          {editing && editing.active ? (
            <Button
              label={t('deactivate', 'Deactivate account')}
              variant="danger"
              onPress={handleDeactivate}
              loading={deactivate.isPending}
            />
          ) : null}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 460, gap: spacing.md },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  roleRow: { gap: spacing.xs },
  roleLabel: { fontSize: typography.sizes.sm, color: colors.text },
  rolePills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pillText: { fontSize: typography.sizes.sm, color: colors.text },
  pillTextActive: { color: colors.textInverse, fontWeight: '700' },
  activeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  toggleOn: { backgroundColor: colors.success },
  toggleText: { color: colors.textInverse, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
