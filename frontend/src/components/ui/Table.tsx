'use client';

import { cn } from '@/lib/utils/cn';
import { ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
  className?: string;
  emptyMessage?: string;
}

export function Table({ headers, rows, className, emptyMessage }: TableProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {headers.map((header, index) => (
              <th
                key={index}
                className="text-left py-3 px-4 text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap"
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
                  <td key={cellIndex} className="py-3 px-4 text-stone-700">
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
