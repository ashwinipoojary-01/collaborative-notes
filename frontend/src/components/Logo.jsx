import { PenLine } from 'lucide-react';

export default function Logo({ compact }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <PenLine className="h-4 w-4" aria-hidden />
      </span>
      {!compact && <span className="text-lg">Inkwell</span>}
    </span>
  );
}
