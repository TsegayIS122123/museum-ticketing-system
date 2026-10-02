'use client';

import { useState, useCallback, useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = 999,
  label,
  className,
  disabled = false,
}: QuantityInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(String(value));

  // Sync the local editable buffer when the external `value` changes --
  // adjusted during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(String(value));
  }

  const handleDecrement = useCallback(() => {
    const newValue = Math.max(min, value - 1);
    onChange(newValue);
  }, [value, min, onChange]);

  const handleIncrement = useCallback(() => {
    const newValue = Math.min(max, value + 1);
    onChange(newValue);
  }, [value, max, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setInputValue('');
      return;
    }
    const num = Number(raw);
    if (!isNaN(num) && Number.isInteger(num)) {
      const clamped = Math.min(Math.max(num, min), max);
      setInputValue(String(clamped));
      onChange(clamped);
    }
  }, [min, max, onChange]);

  const handleBlur = useCallback(() => {
    if (inputValue === '') {
      const defaultValue = min;
      setInputValue(String(defaultValue));
      onChange(defaultValue);
      return;
    }
    const num = Number(inputValue);
    if (isNaN(num) || !Number.isInteger(num)) {
      const fallback = min;
      setInputValue(String(fallback));
      onChange(fallback);
      return;
    }
    const clamped = Math.min(Math.max(num, min), max);
    setInputValue(String(clamped));
    onChange(clamped);
  }, [inputValue, min, max, onChange]);

  const inputId = useId();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-stone-700">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={t('decrease_quantity') || 'Decrease quantity'}
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          className="w-16 h-10 text-center text-lg font-semibold border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:border-transparent disabled:bg-stone-100 disabled:cursor-not-allowed"
          aria-label={label ? undefined : t('quantity_input') || 'Quantity input'}
        />
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={t('increase_quantity') || 'Increase quantity'}
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-sm text-stone-500 ml-1">
          {t('max_label') || 'max'} {max}
        </span>
      </div>
    </div>
  );
}
