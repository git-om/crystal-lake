export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "px-2 py-1 rounded-md text-xs font-medium transition-all",
            value === o.value
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
