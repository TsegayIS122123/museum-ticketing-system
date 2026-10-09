import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: { height: 1, backgroundColor: colors.border, width: '100%' },
});