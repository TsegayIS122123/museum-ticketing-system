import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/theme';
import { CategoryStep, type CategoryLine } from './CategoryStep';
import { AvailabilityStep } from './AvailabilityStep';
import { ReviewStep } from './ReviewStep';
import { StepIndicator } from './StepIndicator';
import { useCreateBooking } from '@/api/queries/bookings';
import { isApiError } from '@/api/errors';

export function BookingWizard() {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreateBooking();

  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<CategoryLine[]>([]);
  const [visitDate, setVisitDate] = useState('');
  const [bookingType, setBookingType] = useState<'individual' | 'group'>('individual');
  const [groupName, setGroupName] = useState('');
  const [groupTin, setGroupTin] = useState('');

  const steps = [
    t('step1', 'Tickets'),
    t('step2', 'Date'),
    t('step3', 'Review'),
  ];

  const handleConfirm = async () => {
    try {
      const booking = await create.mutateAsync({
        visit_date: visitDate,
        booking_type: bookingType,
        group_name: bookingType === 'group' ? groupName : undefined,
        group_tin: bookingType === 'group' ? groupTin : undefined,
        items: lines.map((l) => ({
          category_id: l.categoryId,
          quantity: l.quantity,
        })),
      });

      if (booking.checkout_url) {
        router.replace({
          pathname: '/(visitor)/book/payment',
          params: { bookingId: booking.id, checkoutUrl: booking.checkout_url },
        });
      } else {
        router.replace(`/(visitor)/bookings/${booking.id}` as any);
      }
    } catch (err) {
      const msg = isApiError(err) ? err.message : t('commonErrorGeneric', 'Something went wrong');
      Alert.alert(t('bookingFailed', 'Booking failed'), msg);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.indicator}>
          <StepIndicator steps={steps} current={step} />
        </View>

        {step === 0 ? (
          <CategoryStep
            lines={lines}
            onLinesChange={setLines}
            onNext={() => setStep(1)}
          />
        ) : step === 1 ? (
          <AvailabilityStep
            visitDate={visitDate}
            onVisitDateChange={setVisitDate}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        ) : (
          <ReviewStep
            lines={lines}
            visitDate={visitDate}
            bookingType={bookingType}
            onBookingTypeChange={setBookingType}
            groupName={groupName}
            onGroupNameChange={setGroupName}
            groupTin={groupTin}
            onGroupTinChange={setGroupTin}
            onBack={() => setStep(1)}
            onConfirm={handleConfirm}
            isSubmitting={create.isPending}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, backgroundColor: colors.background },
  indicator: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
});
