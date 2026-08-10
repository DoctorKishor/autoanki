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

  return (
    <div className={`radio-input ${isDark ? 'dark-theme' : 'light-theme'}`}>
      <div className="selector">
        {options.map((opt, index) => {
          const isChecked = value === opt.value;
          const inputId = `${name}_opt_${opt.value}_${index}`;

          return (
            <div
              key={opt.value}
              className="choice"
              onClick={() => onChange(opt.value)}
            >
              <div>
                <input
                  type="radio"
                  className="choice-circle"
                  name={name}
                  id={inputId}
                  value={opt.value}
                  checked={isChecked}
                  onChange={() => onChange(opt.value)}
                />
                <div className="ball"></div>
              </div>
              <label
                htmlFor={inputId}
                className="choice-name"
                onClick={(e) => e.stopPropagation()}
              >
                <span>{opt.label}</span>
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
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default UiverseGlassRadio;
