'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

interface ReferenceLookupFieldProps {
  onLookup: (reference: string) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function ReferenceLookupField({
  onLookup,
  isLoading = false,
  error = null,
  className,
}: ReferenceLookupFieldProps) {
  const { t } = useTranslation();
  const [reference, setReference] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reference.trim()) {
      onLookup(reference.trim());
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Handle QR scanner paste (keyboard wedge)
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      setReference(pasted.trim());
      // Auto-submit after paste delay for QR scans
      setTimeout(() => {
        if (pasted.trim()) {
          onLookup(pasted.trim());
        }
      }, 100);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <TextField
            ref={inputRef}
            id="reference"
            label={t('enter_booking_reference') || 'Enter Booking Reference'}
            placeholder={t('reference_placeholder') || 'e.g., BK-2024-001 or scan QR code'}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onPaste={handlePaste}
            error={error || undefined}
            disabled={isLoading}
            className="font-mono text-lg tracking-wider"
            autoFocus
          />
          <div className="mt-1 text-xs text-stone-500">
            {t('scan_or_type') || 'Type the reference or scan the QR code (keyboard wedge scanner works here)'}
          </div>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            size="lg"
            className="bg-brand-primary hover:bg-primary-700 h-[42px]"
            disabled={isLoading || !reference.trim()}
          >
            {isLoading ? t('searching') || 'Searching...' : t('lookup') || 'Lookup'}
          </Button>
        </div>
      </form>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          {t('looking_up') || 'Looking up booking...'}
        </div>
      )}
    </div>
  );
}
