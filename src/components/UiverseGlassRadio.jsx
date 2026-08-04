import React from 'react';

/**
 * UiverseGlassRadio - Scaled, theme-matched 3D Glass Radio Selector
 * Inspired by LilaRest on Uiverse.io
 * 
 * @param {Object} props
 * @param {string} props.name - Unique input name for the radio group
 * @param {Array<{value: string, label: string, badge?: string}>} props.options - Array of options
 * @param {string} props.value - Currently selected value
 * @param {Function} props.onChange - Handler called with new selected value
 * @param {string} [props.themeMode='dark'] - 'dark' | 'light'
 * @param {string} [props.size='md'] - 'sm' | 'md'
 */
export function UiverseGlassRadio({
  name,
  options = [],
  value,
  onChange,
  themeMode = 'dark',
  size = 'md'
}) {
  const isDark = themeMode === 'dark';

  // Dimension configurations for sizing
  const isSm = size === 'sm';
  const circleSize = isSm ? 'w-5 h-5' : 'w-6 h-6';
  const glassWidth = isSm ? 'w-10' : 'w-12';
  const translateXDist = isSm ? '-44px' : '-52px';
  const labelFontSize = isSm ? 'text-[11px]' : 'text-xs md:text-sm';

  return (
    <div className="relative flex items-stretch w-full py-1">
      {/* Glass Tube Container on the Left */}
      <div
        className={`absolute left-0 top-0 bottom-0 ${glassWidth} rounded-2xl z-10 p-1 flex flex-col justify-between transition-all duration-300 pointer-events-none ${
          isDark
            ? 'bg-slate-800/60 border border-slate-700/80 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.1),inset_0_-2px_6px_rgba(0,0,0,0.4)] backdrop-blur-md'
            : 'bg-slate-200/70 border border-white/80 shadow-[0_10px_20px_-5px_rgba(50,50,93,0.15),inset_0_2px_4px_rgba(255,255,255,0.8),inset_0_-2px_6px_rgba(0,0,0,0.1)] backdrop-blur-md'
        }`}
      >
        <div
          className={`w-full h-full rounded-xl border-2 ${
            isDark ? 'border-slate-600/40' : 'border-white/60'
          }`}
        />
      </div>

      {/* Selector Options Column */}
      <div className={`flex flex-col justify-center space-y-2.5 w-full ${isSm ? 'pl-12' : 'pl-16'}`}>
        {options.map((opt) => {
          const isChecked = value === opt.value;

          return (
            <label
              key={opt.value}
              className="group relative flex items-center cursor-pointer select-none py-1"
              onClick={() => onChange(opt.value)}
            >
              {/* Radio Circle Container with 3D Ball */}
              <div className={`relative ${circleSize} mr-3 flex-shrink-0 z-0`}>
                <input
                  type="radio"
                  name={name}
                  value={opt.value}
                  checked={isChecked}
                  onChange={() => onChange(opt.value)}
                  className="sr-only"
                />
                
                {/* Circle Ring Outer */}
                <div
                  className={`w-full h-full rounded-full border-2 transition-all duration-300 ${
                    isChecked
                      ? isDark
                        ? 'border-blue-400 bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                        : 'border-blue-600 bg-blue-50 shadow-[0_0_10px_rgba(37,99,235,0.3)]'
                      : isDark
                        ? 'border-slate-600 group-hover:border-slate-500 bg-slate-800/40'
                        : 'border-slate-300 group-hover:border-slate-400 bg-slate-100'
                  }`}
                />

                {/* Sliding 3D Ball */}
                <div
                  className={`absolute inset-0 rounded-full z-20 pointer-events-none transition-all duration-700 ${
                    isChecked ? 'scale-100 opacity-100' : 'scale-90 opacity-90'
                  }`}
                  style={{
                    transform: isChecked ? 'translateX(0px)' : `translateX(${translateXDist})`,
                    transition: 'transform 700ms cubic-bezier(1, -0.4, 0, 1.4), opacity 300ms ease, scale 300ms ease',
                    background: isChecked
                      ? isDark
                        ? 'radial-gradient(circle at 35% 35%, #60a5fa 0%, #3b82f6 50%, #1d4ed8 100%)'
                        : 'radial-gradient(circle at 35% 35%, #93c5fd 0%, #2563eb 60%, #1e40af 100%)'
                      : isDark
                        ? 'radial-gradient(circle at 35% 35%, #94a3b8 0%, #64748b 60%, #334155 100%)'
                        : 'radial-gradient(circle at 35% 35%, #ffffff 0%, #cbd5e1 60%, #94a3b8 100%)',
                    boxShadow: isChecked
                      ? isDark
                        ? 'inset 0 -3px 4px rgba(0,0,0,0.5), inset 0 3px 4px rgba(255,255,255,0.4), 0 0 10px rgba(59,130,246,0.6)'
                        : 'inset 0 -3px 4px rgba(0,0,0,0.3), inset 0 3px 4px rgba(255,255,255,0.6), 0 2px 8px rgba(37,99,235,0.4)'
                      : isDark
                        ? 'inset 0 -3px 4px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.2)'
                        : 'inset 0 -3px 4px rgba(0,0,0,0.2), inset 0 2px 3px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.1)'
                  }}
                />
              </div>

              {/* Option Label Text & Optional Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`${labelFontSize} font-bold transition-colors duration-200 ${
                    isChecked
                      ? isDark
                        ? 'text-white'
                        : 'text-gray-900'
                      : isDark
                        ? 'text-gray-400 group-hover:text-gray-200'
                        : 'text-gray-600 group-hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </span>
                {opt.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      isChecked
                        ? isDark
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                        : isDark
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default UiverseGlassRadio;
