'use client';
import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

// One choice from a short list, shown as adjacent buttons (mirrors the VR menu).
export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string, string?][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([v, text, title]) => (
        <button
          key={v}
          aria-pressed={v === value}
          title={title}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string;
  value: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="stepper">
      <button aria-label={'Decrease ' + label.toLowerCase()} onClick={onDown}>
        <Minus size={18} />
      </button>
      <output>{value}</output>
      <button aria-label={'Increase ' + label.toLowerCase()} onClick={onUp}>
        <Plus size={18} />
      </button>
    </div>
  );
}

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
