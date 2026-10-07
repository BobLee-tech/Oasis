export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export const inputClass =
  'w-full rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] text-slate-800 placeholder:text-slate-400 ' +
  'focus:border-[#39C5BB] focus:outline-none focus:ring-2 focus:ring-[#39C5BB]/20';
