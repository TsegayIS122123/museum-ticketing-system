import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing, typography } from '@/theme';
import {
  useUpdateVoucher,
  type IfmisVoucher,
  type VoucherUpdateInput,
} from '@/api/queries/ifmis-voucher';
import { isApiError } from '@/api/errors';

interface VoucherFormProps {
  bookingId: string;
  voucher: IfmisVoucher;
  onSuccess?: () => void;
}

export function VoucherForm({ bookingId, voucher, onSuccess }: VoucherFormProps) {
  const { t } = useTranslation();
  const update = useUpdateVoucher();

  const [documentNo, setDocumentNo] = useState(voucher.documentNo ?? '');
  const [refNo, setRefNo] = useState(voucher.refNo ?? '');

  const alreadyRecorded = voucher.voucherRecorded;

  useEffect(() => {
    setDocumentNo(voucher.documentNo ?? '');
    setRefNo(voucher.refNo ?? '');
  }, [voucher]);

  const handleSubmit = async () => {
    if (!documentNo.trim() || !refNo.trim()) {
      Alert.alert(
        t('commonErrorGeneric', 'Something went wrong'),
        t('voucherFieldsRequired', 'Both Document No and Ref No are required.')
      );
      return;
    }
    try {
      const input: VoucherUpdateInput = {
        documentNo: documentNo.trim(),
        refNo: refNo.trim(),
      };
      await update.mutateAsync({ bookingId, input });
      onSuccess?.();
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('voucherSaveFailed', 'Failed to record voucher'), msg);
    }
  };

  return (
    <Card>
      <Text style={styles.title}>
        {alreadyRecorded
          ? t('voucherRecorded', 'IFMIS voucher recorded')
          : t('recordVoucher', 'Record IFMIS voucher')}
      </Text>

      <Text style={styles.hint}>
        {t(
          'voucherHint',
          'Key the fields below into IFMIS yourself, then enter the Document No and Ref No IFMIS returns.'
        )}
      </Text>

      {/* The fields she copies into IFMIS */}
      <View style={styles.copyBlock}>
        <CopyRow
          label={t('publicBody', 'Paying public body')}
          value={voucher.nameOfPublicBody}
        />
        <CopyRow
          label={t('payer', 'Payer')}
          value={voucher.receivedFrom ?? '—'}
        />
        <CopyRow
          label={t('voucherDate', 'Date')}
          value={voucher.date ?? '—'}
        />
        <CopyRow
          label={t('amountFig', 'Amount')}
          value={voucher.amountFigures ?? '—'}
        />
        <CopyRow
          label={t('amountWords', 'Amount in words')}
          value={voucher.amountWords ?? '—'}
        />
        <CopyRow
          label={t('purpose', 'Purpose')}
          value={voucher.purpose ?? '—'}
        />
      </View>

      {/* The two identifiers she brings back */}
      <TextField
        label={t('documentNo', 'Document No')}
        value={documentNo}
        onChangeText={setDocumentNo}
        placeholder={t('documentNoPlaceholder', 'e.g. 00123')}
        autoCapitalize="characters"
        editable={!alreadyRecorded}
      />
      <TextField
        label={t('refNo', 'Ref No')}
        value={refNo}
        onChangeText={setRefNo}
        placeholder={t('refNoPlaceholder', 'e.g. R-9876')}
        autoCapitalize="characters"
        editable={!alreadyRecorded}
      />

      {!alreadyRecorded ? (
        <Button
          label={
            update.isPending
              ? t('loading', 'Loading…')
              : t('saveVoucher', 'Save voucher reference')
          }
          onPress={handleSubmit}
          loading={update.isPending}
        />
      ) : (
        <View style={styles.okRow}>
          <Text style={styles.okText}>
            {t('voucherConfirmed', 'Confirmed')}
          </Text>
        </View>
      )}
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.copyRow}>
      <Text style={styles.copyLabel}>{label}</Text>
      <Text style={styles.copyValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: typography.sizes.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  hint: { fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  copyBlock: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  copyRow: { paddingVertical: spacing.xs },
  copyLabel: { fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' },
  copyValue: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: typography.fontFamily.latin,
  },
  okRow: {
    backgroundColor: '#D1FAE5',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  okText: { color: '#065F46', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
});
