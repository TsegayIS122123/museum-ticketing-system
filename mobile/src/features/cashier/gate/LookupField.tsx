import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing, typography } from '@/theme';
import { BOOKING_REFERENCE_REGEX } from '@/constants/config';

interface LookupFieldProps {
  onSubmit: (reference: string) => void;
  loading?: boolean;
}

export function LookupField({ onSubmit, loading = false }: LookupFieldProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const ref = value.trim().toUpperCase();
    if (!BOOKING_REFERENCE_REGEX.test(ref)) {
      setError(t('invalidReference', 'Enter a valid 8-character reference (e.g., K7M2QP4A).'));
      return;
    }
    setError('');
    onSubmit(ref);
  };

  return (
    <View style={styles.wrap}>
      <TextField
        label={t('reference', 'Reference')}
        value={value}
        onChangeText={(v) => setValue(v.toUpperCase())}
        placeholder="K7M2QP4A"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        error={error || undefined}
      />
      <Button
        label={loading ? t('loading', 'Loading…') : t('lookup', 'Lookup')}
        onPress={handleSubmit}
        disabled={loading || !value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
});
