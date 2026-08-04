import React from 'react';

/**
 * UiverseSwitch - 3D Neumorphic ON/OFF Toggle Switch
 * Based on design by mobinkakei on Uiverse.io
 * 
 * @param {Object} props
 * @param {string} props.id - Input element ID/key
 * @param {string} props.label - Label text for the option
 * @param {boolean} props.checked - Current ON/OFF state
 * @param {Function} props.onChange - Toggle handler
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {string} [props.themeMode='dark'] - 'dark' | 'light'
 * @param {string} [props.size='md'] - 'sm' | 'md'
 */
export function UiverseSwitch({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  themeMode = 'dark',
  size = 'md'
}) {
  const isDark = themeMode === 'dark';
  const isSm = size === 'sm';

  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`group relative flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 cursor-pointer select-none ${
        disabled ? 'opacity-40 pointer-events-none' : 'active:scale-[0.99]'
      } ${
        checked
          ? isDark
            ? 'neu-pressed-dark border border-emerald-500/30'
            : 'neu-pressed-light border border-emerald-500/30'
          : isDark
            ? 'neu-card-dark hover:border-slate-700'
            : 'neu-card-light hover:border-slate-200'
      }`}
    >
      {/* Switch Label */}
      <span
        className={`text-xs md:text-sm font-bold transition-colors duration-200 ${
          checked
            ? isDark
              ? 'text-white'
              : 'text-gray-900'
            : isDark
              ? 'text-gray-400 group-hover:text-gray-300'
              : 'text-gray-600 group-hover:text-gray-900'
        }`}
      >
        {label}
      </span>

      {/* 3D Neumorphic Switch Track & Slider Knob */}
      <div className="relative flex items-center flex-shrink-0 ml-3">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <label
          htmlFor={id}
          className={`relative inline-block cursor-pointer transition-all duration-300 ${
            isSm ? 'w-[72px] h-[32px] rounded-full' : 'w-[84px] h-[36px] rounded-full'
          } ${
            isDark
              ? 'bg-slate-900/80 shadow-[inset_3px_3px_6px_rgba(0,0,0,0.7),inset_-2px_-2px_4px_rgba(255,255,255,0.05)]'
              : 'bg-slate-200/90 shadow-[inset_3px_3px_6px_rgba(0,0,0,0.18),inset_-3px_-3px_6px_rgba(255,255,255,0.8)]'
          }`}
        >
          {/* Neumorphic Sliding Knob */}
          <span
            className={`absolute top-[4px] flex items-center justify-center font-black transition-all duration-300 ${
              isSm
                ? 'w-[32px] h-[24px] text-[10px] rounded-full'
                : 'w-[38px] h-[28px] text-[11px] rounded-full'
            }`}
            style={{
              left: checked ? (isSm ? 'calc(100% - 36px)' : 'calc(100% - 42px)') : '4px',
              backgroundColor: checked
                ? '#00b33c'
                : isDark
                  ? '#334155'
                  : '#e2e8f0',
              color: checked ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
              boxShadow: checked
                ? isDark
                  ? '-2px -2px 5px rgba(255, 255, 255, 0.2), 0 0 12px rgba(0, 179, 60, 0.6)'
                  : '-2px -2px 5px rgba(255, 255, 255, 0.6), 2px 2px 5px rgba(0, 179, 60, 0.4)'
                : isDark
                  ? '-2px -2px 4px rgba(255, 255, 255, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.5)'
                  : '-2px -2px 4px rgba(255, 255, 255, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.15)'
            }}
          >
            {checked ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>
    </div>
  );
}

export default UiverseSwitch;
