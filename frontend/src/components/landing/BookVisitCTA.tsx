'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface BookVisitCTAProps {
  lang: 'en' | 'am';
  labels: {
    bookNow: string;
    modalTitle: string;
    schoolTitle: string;
    schoolDescription: string;
    personalTitle: string;
    personalDescription: string;
  };
}

// UAT round 1: the landing page's quiet secondary "planning a school
// visit?" text link was going unnoticed. Replaced with one prominent
// button that opens a modal offering the school and personal paths as
// two visually equal choices, instead of one primary button and one
// easy-to-miss link. `/group-visits/new` and `/book` still work as
// direct URLs on their own -- this modal is only an extra entry point
// into them, never a gate in front of them.
export function BookVisitCTA({ lang, labels }: BookVisitCTAProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-sun inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-full px-8 py-3 text-base font-bold focus:outline-none focus:ring-4 focus:ring-sun-300 focus:ring-offset-2"
      >
        {labels.bookNow}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={labels.modalTitle}>
        {/* `sm:grid-cols-2` stacks the two choices on mobile (Phase 4's
            "stack on mobile, tap targets >= 44px" requirement) and sits
            them side by side, visually equal, from `sm` up. */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            href={`/${lang}/group-visits/new`}
            onClick={() => setOpen(false)}
            className="lift flex flex-col gap-1.5 rounded-2xl border-2 border-stone-200 bg-white p-5 min-h-[44px] hover:border-brand-primary hover:bg-primary-50/60 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <span className="flex items-center gap-2 font-semibold text-stone-900">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sun-400 to-sun-600 text-white shadow"><GraduationCap className="w-5 h-5" /></span>
              {labels.schoolTitle}
            </span>
            <span className="text-sm text-stone-500">{labels.schoolDescription}</span>
          </Link>
          <Link
            href={`/${lang}/book`}
            onClick={() => setOpen(false)}
            className="lift flex flex-col gap-1.5 rounded-2xl border-2 border-stone-200 bg-white p-5 min-h-[44px] hover:border-brand-primary hover:bg-primary-50/60 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <span className="flex items-center gap-2 font-semibold text-stone-900">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-primary-500 text-white shadow"><User className="w-5 h-5" /></span>
              {labels.personalTitle}
            </span>
            <span className="text-sm text-stone-500">{labels.personalDescription}</span>
          </Link>
        </div>
      </Modal>
    </>
  );
}
