import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { Card } from '@/components/ui/Card';
import type { StaffAccount } from '@/api/queries/admin-staff';

const ROLE_LABEL: Record<StaffAccount['role'], string> = {
  cashier: 'Cashier',
  museum_manager: 'Museum Manager',
  platform_admin: 'Platform Admin',
};

interface StaffCardProps {
  staff: StaffAccount;
  onEdit: () => void;
}

export function StaffCard({ staff, onEdit }: StaffCardProps) {
  return (
    <Pressable onPress={onEdit}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{staff.full_name}</Text>
            <Text style={styles.email}>{staff.email}</Text>
            {staff.phone ? <Text style={styles.phone}>{staff.phone}</Text> : null}
          </View>
          <View style={styles.badges}>
            <View
              style={[
                styles.badge,
                staff.active ? styles.badgeActive : styles.badgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  staff.active ? styles.badgeTextActive : styles.badgeTextInactive,
                ]}
              >
                {staff.active ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeRole]}>
              <Text style={styles.badgeTextRole}>{ROLE_LABEL[staff.role]}</Text>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  name: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text },
  email: { fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: 2 },
  phone: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  badges: { alignItems: 'flex-end', gap: spacing.xs },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeActive: { backgroundColor: '#D1FAE5' },
  badgeInactive: { backgroundColor: '#E5E7EB' },
  badgeRole: { backgroundColor: colors.brandPrimaryLight },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  badgeTextActive: { color: '#065F46' },
  badgeTextInactive: { color: '#374151' },
  badgeTextRole: { color: colors.brandPrimary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
