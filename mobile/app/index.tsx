import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/useAuth';
import { homeForRole } from '@/auth/guards';
import { colors } from '@/theme';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      router.replace(homeForRole(user.role) as any);
    } else {
      router.replace('/(auth)/visitor-verify');
    }
  }, [user, isLoading, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
