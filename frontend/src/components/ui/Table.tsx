'use client';

import { cn } from '@/lib/utils/cn';
import { ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
  className?: string;
  emptyMessage?: string;
  /** Tighter row padding for surfaces where someone is scanning many rows
   *  fast (the staff ledger tables) rather than browsing a short list. */
  dense?: boolean;
  /** Zero-based column indices that hold money/count values. Rendered
   *  right-aligned with tabular figures so the digits stack into columns
   *  instead of drifting with each row's proportional-width digits. */
  numericColumns?: number[];
}

export function Table({ headers, rows, className, emptyMessage, dense, numericColumns }: TableProps) {
  const { t } = useTranslation();
  const cellPadding = dense ? 'py-2 px-4' : 'py-3 px-4';
  const isNumeric = (index: number) => numericColumns?.includes(index) ?? false;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {headers.map((header, index) => (
              <th
                key={index}
                className={cn(
                  'text-left text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap',
                  cellPadding,
                  isNumeric(index) && 'text-right'
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="py-8 text-center text-stone-400 text-sm"
              >
                {emptyMessage || t('no_data_available') || 'No data available'}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-stone-100 hover:bg-stone-50 transition-colors"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      'text-stone-700',
                      cellPadding,
                      isNumeric(cellIndex) && 'text-right font-mono tabular-nums'
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
