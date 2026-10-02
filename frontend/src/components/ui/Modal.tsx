'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  // Where focus was before the modal opened, so closing it (Esc, backdrop
  // click, or the X button) gives focus back to whatever the person was
  // on rather than dropping it to <body> -- the other half of "keyboard
  // reachable": getting *out* has to be as clean as getting in.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
        return;
      }
      // Focus trap: Tab/Shift+Tab cycle only through this modal's own
      // focusable elements, never escaping to the page behind the
      // backdrop -- required for a real `role="dialog"` (WAI-ARIA
      // Dialog pattern), not just decorative.
      if (e.key === 'Tab' && open && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      // Move focus into the modal the moment it opens -- without this,
      // focus stays on whatever triggered it, behind the backdrop, and
      // the first Tab press would jump somewhere on the page the person
      // can no longer see or interact with.
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable ?? modalRef.current)?.focus();
    } else {
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          "relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h3 id="modal-title" className="font-semibold text-lg text-stone-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-500 hover:text-stone-700 transition-colors"
            aria-label={t('close_modal') || 'Close modal'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
