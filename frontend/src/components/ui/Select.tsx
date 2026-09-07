'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

// A fully custom-rendered dropdown, used instead of a native <select>.
//
// Native <select> popups are rendered by the OS/browser chrome itself,
// not by our CSS, and on some mobile browsers the popup's width is
// calculated independently of the trigger element -- it can end up
// wider than the viewport with no way for app code to constrain it,
// spilling off the side of the screen. Rendering the menu ourselves as
// a normal absolutely-positioned <div> anchored with `left-0 right-0`
// means it's pinned to (and can never exceed) the width of its trigger,
// which itself already respects the page's responsive layout.
export function Select({ id, value, onChange, options, placeholder, className }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative w-full min-w-0', className)}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-stone-400 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 w-full max-w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-lg"
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left hover:bg-stone-50',
                  option.value === value && 'font-medium text-secondary-600'
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <Check className="h-4 w-4 flex-shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
