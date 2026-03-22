// DigitRoll — Mechanical digit-roll counter for hero card sensor values.
// Each digit animates independently on value change (translateY roll effect).
// Only changed digits animate — unchanged digits stay static.

import { useRef, useEffect, useState } from 'react';

interface DigitRollProps {
  value: string;      // formatted value string, e.g. "22.5" or "800.0"
  fontSize: number;   // 48 for hero card
  color: string;      // sensor status color
}

// Is this character an animatable digit?
const isDigit = (ch: string) => ch >= '0' && ch <= '9';

interface DigitState {
  char: string;
  animating: boolean;
  delay: number;
}

export const DigitRoll = ({ value, fontSize, color }: DigitRollProps) => {
  const prevValueRef = useRef<string>('');
  const [digits, setDigits] = useState<DigitState[]>(() =>
    value.split('').map((char) => ({ char, animating: false, delay: 0 }))
  );

  useEffect(() => {
    const prev = prevValueRef.current;
    const curr = value;

    if (prev === curr) return;

    // Align old and new character arrays by right-padding the shorter one
    const maxLen = Math.max(prev.length, curr.length);
    const prevChars = prev.padStart(maxLen, ' ').split('');
    const currChars = curr.padStart(maxLen, ' ').split('');

    let delayIndex = 0;
    const newDigits: DigitState[] = currChars.map((ch, i) => {
      const changed = prevChars[i] !== ch && isDigit(ch);
      const delay = changed ? delayIndex++ * 30 : 0;
      return { char: ch, animating: changed, delay };
    });

    setDigits(newDigits);
    prevValueRef.current = curr;

    // Clear animating flags after transitions complete (200ms base + max stagger)
    const maxDelay = delayIndex * 30;
    const timer = setTimeout(() => {
      setDigits((prev) => prev.map((d) => ({ ...d, animating: false })));
    }, 200 + maxDelay + 50);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <span
      data-testid="digit-roll"
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize,
        fontWeight: 700,
        color,
        lineHeight: 1.1,
        display: 'inline-flex',
        alignItems: 'flex-end',
      }}
    >
      {digits.map((d, i) => {
        const canAnimate = isDigit(d.char);

        if (!canAnimate) {
          // Decimal point, minus sign, space — render static
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                position: 'relative',
                lineHeight: 1.2,
              }}
            >
              {d.char.trim() || ''}
            </span>
          );
        }

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              height: '1.2em',
              position: 'relative',
            }}
          >
            <span
              style={{
                display: 'block',
                transform: d.animating ? 'translateY(0)' : 'translateY(0)',
                transition: d.animating
                  ? `transform 200ms ease-out ${d.delay}ms`
                  : 'none',
                animation: d.animating
                  ? `digitRollIn 200ms ease-out ${d.delay}ms both`
                  : 'none',
              }}
            >
              {d.char}
            </span>
          </span>
        );
      })}
    </span>
  );
};

// Inject digit roll keyframes once (ConnectionBadge pattern)
const DIGIT_ROLL_STYLE_ID = 'digit-roll-animations';

if (typeof document !== 'undefined' && !document.getElementById(DIGIT_ROLL_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = DIGIT_ROLL_STYLE_ID;
  style.textContent = `
    @keyframes digitRollIn {
      0%   { transform: translateY(100%); opacity: 0; }
      100% { transform: translateY(0);    opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
