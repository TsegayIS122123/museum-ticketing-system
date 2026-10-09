import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

export default function ManagerTabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: t('tabDashboard', 'Dashboard'),
        tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="categories" options={{
        title: t('tabCategories', 'Categories'),
        tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="availability" options={{
        title: t('tabAvailability', 'Dates'),
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="reports" options={{
        title: t('tabReports', 'Reports'),
        tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" color={color} size={size} />,
      }} />
    </Tabs>
  );
}
