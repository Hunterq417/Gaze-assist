function SliderControl({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/65 bg-white/56 p-4 shadow-[0_10px_22px_rgba(93,103,148,0.12)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="slider-thumb h-2 w-full cursor-pointer appearance-none rounded-full bg-purple-200/90"
      />
    </div>
  );
}

export default SliderControl;
