import { cn } from '@/lib/utils/cn';
import { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
  className?: string;
}

export function Table({ headers, rows, className }: TableProps) {
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
                No data available
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
