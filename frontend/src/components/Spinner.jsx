import { Loader2 } from 'lucide-react';

export default function Spinner({ className = 'h-5 w-5', label = 'Loading' }) {
  return <Loader2 className={`animate-spin text-slate-400 ${className}`} aria-label={label} role="status" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
