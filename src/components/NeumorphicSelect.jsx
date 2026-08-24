import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export default function NeumorphicSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option...',
  isDark = false,
  className = '',
  buttonClassName = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Format options into standardized array of { label, value }
  const formattedOptions = options.map(opt =>
    typeof opt === 'object' && opt !== null
      ? opt
      : { label: String(opt), value: String(opt) }
  );

  const selectedOption = formattedOptions.find(o => o.value === value) || formattedOptions[0];

  // Close popup menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative w-full text-left select-none ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full p-3.5 rounded-2xl text-xs font-black flex items-center justify-between transition-all cursor-pointer ${
          isDark 
            ? 'neu-pressed-dark text-gray-100 border border-gray-800 hover:border-gray-700' 
            : 'neu-pressed-light text-gray-900 border border-white/80 hover:border-gray-300'
        } ${buttonClassName}`}
      >
        <span className="truncate pr-2 font-sans">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          className={`w-4 h-4 shrink-0 transition-transform duration-300 ${
            isDark ? 'text-gray-400' : 'text-gray-600'
          } ${isOpen ? 'rotate-180 text-blue-500' : ''}`} 
        />
      </button>

      {/* Floating Neumorphic Options Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute left-0 right-0 top-full mt-2 z-50 p-2 rounded-2xl max-h-64 overflow-y-auto shadow-2xl backdrop-blur-md transition-all ${
              isDark 
                ? 'neu-card-dark border border-gray-800/90 text-gray-100 bg-[#222730]/95' 
                : 'neu-card-light border border-white/90 text-gray-900 bg-[#e6ecf5]/95'
            }`}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <div className="space-y-1">
              {formattedOptions.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? (isDark 
                            ? 'neu-pressed-dark text-blue-400 font-extrabold border border-blue-500/30' 
                            : 'neu-pressed-light text-blue-600 font-extrabold border border-blue-400/40')
                        : (isDark 
                            ? 'text-gray-200 hover:bg-gray-800/60 hover:text-white' 
                            : 'text-gray-800 hover:bg-white/60 hover:text-gray-900')
                    }`}
                  >
                    <span className="truncate pr-2">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-500" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
