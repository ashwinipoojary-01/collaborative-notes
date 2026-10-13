import { colorFor, initials } from '../utils/format';

export default function Avatar({ user, size = 'md', ring = false, title }) {
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };
  return (
    <span
      title={title ?? user?.name}
      aria-label={title ?? user?.name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${sizes[size]} ${colorFor(user?.id)} ${
        ring ? 'ring-2 ring-white dark:ring-slate-900' : ''
      }`}
    >
      {initials(user?.name)}
    </span>
  );
}
