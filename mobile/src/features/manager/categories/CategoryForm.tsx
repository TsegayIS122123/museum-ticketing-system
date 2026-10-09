import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing, typography } from '@/theme';
import {
  useCategoryMutations,
  type ManagerCategory,
} from '@/api/queries/manager-categories';
import { isApiError } from '@/api/errors';

interface CategoryFormProps {
  visible: boolean;
  editing: ManagerCategory | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function CategoryForm({ visible, editing, onClose, onSaved }: CategoryFormProps) {
  const { t } = useTranslation();
  const { create, update } = useCategoryMutations();

  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [price, setPrice] = useState('0');

  useEffect(() => {
    if (editing) {
      setNameEn(editing.name_en);
      setNameAm(editing.name_am);
      setPrice(editing.price_etb);
    } else {
      setNameEn('');
      setNameAm('');
      setPrice('0');
    }
  }, [editing, visible]);

  const handleSubmit = async () => {
    if (!nameEn.trim() || !nameAm.trim()) {
      Alert.alert(t('commonErrorGeneric', 'Something went wrong'), t('nameRequired', 'Both names required'));
      return;
    }
    try {
      const input = { name_en: nameEn.trim(), name_am: nameAm.trim(), price_etb: price };
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
      } else {
        await create.mutateAsync(input);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('saveFailed', 'Save failed'), msg);
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <Text style={styles.title}>
            {editing ? t('editCategory', 'Edit category') : t('addCategory', 'New category')}
          </Text>
          <TextField label={t('nameEnglish', 'Name (EN)')} value={nameEn} onChangeText={setNameEn} />
          <TextField label={t('nameAmharic', 'Name (AM)')} value={nameAm} onChangeText={setNameAm} />
          <TextField
            label={t('price', 'Price (ETB)')}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
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
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 440, gap: spacing.md },
  title: { fontSize: typography.sizes.lg, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
