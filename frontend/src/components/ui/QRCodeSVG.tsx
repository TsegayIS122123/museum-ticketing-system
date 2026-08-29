'use client';

import { useEffect, useRef } from 'react';

interface QRCodeSVGProps {
  value: string;
  size?: number;
  className?: string;
}

// Simple QR code placeholder - in production use a proper QR library
export function QRCodeSVG({ value, size = 160, className = '' }: QRCodeSVGProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // In production, use a QR code generation library
    // For now, we show a placeholder with the value
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw a simple placeholder QR pattern
    const cellSize = size / 21;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Generate a simple pattern based on the value
    const seed = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pattern = [];
    for (let i = 0; i < 21; i++) {
      pattern[i] = [];
      for (let j = 0; j < 21; j++) {
        const val = (i * 7 + j * 13 + seed) % 3;
        pattern[i][j] = val === 0 || val === 1;
      }
    }

    // Draw the QR pattern
    for (let i = 0; i < 21; i++) {
      for (let j = 0; j < 21; j++) {
        if (pattern[i][j]) {
          ctx.fillStyle = '#1c1917';
          ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw the finder patterns
    const drawFinderPattern = (x: number, y: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const isBorder = i === 0 || i === 6 || j === 0 || j === 6;
          const isInner = (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          if (isBorder || isInner) {
            ctx.fillStyle = '#1c1917';
            ctx.fillRect((x + j) * cellSize, (y + i) * cellSize, cellSize, cellSize);
          }
        }
      }
    };

    drawFinderPattern(0, 0);
    drawFinderPattern(14, 0);
    drawFinderPattern(0, 14);

  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
