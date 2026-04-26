/**
 * Logo SensADS — S stylisé avec dégradé cyan → bleu foncé.
 */

import { cn } from '@/lib/cn';

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 40, showText = true, className }: LogoProps): JSX.Element {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="SensADS logo"
      >
        <defs>
          <linearGradient id="sensads-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="50%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="20" fill="#000" />
        <path
          d="M65 35 Q 65 20, 50 20 Q 30 20, 30 35 Q 30 45, 50 50 Q 70 55, 70 65 Q 70 80, 50 80 Q 35 80, 35 65"
          stroke="url(#sensads-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight text-textPrimary">SENSADS</span>
          <span className="text-[10px] font-light tracking-wider text-textSecondary">
            by SENSIUM-X
          </span>
        </div>
      )}
    </div>
  );
}
