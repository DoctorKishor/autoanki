import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * A neumorphic card component that expands and collapses with smooth animations.
 * 
 * @param {Object} props
 * @param {string} props.title - Title of the card.
 * @param {React.ReactNode} props.children - Expanded content.
 * @param {boolean} [props.defaultOpen=true] - Initial expand state.
 * @param {React.ComponentType} [props.icon] - Optional Lucide icon to display next to the title.
 * @param {string} [props.themeMode='dark'] - Dual theme ('dark' | 'light').
 */
export default function CollapsibleCard({ 
  title, 
  children, 
  defaultOpen = true, 
  icon: Icon,
  themeMode = 'dark'
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isDark = themeMode === 'dark';

  return (
    <div className={`${isDark ? 'neu-card-dark' : 'neu-card-light'} rounded-3xl transition-all duration-300 overflow-hidden`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-5 py-4 flex items-center justify-between transition-colors focus:outline-none cursor-pointer select-none ${
          isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
        }`}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2 rounded-xl ${isDark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600'}`}>
              <Icon className="w-4 h-4" />
            </div>
          )}
          <h3 className={`font-black text-sm md:text-base tracking-tight text-left ${
            isDark ? 'text-slate-100' : 'text-slate-850'
          }`}>
            {title}
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`p-1.5 rounded-xl shrink-0 ${
            isDark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600'
          }`}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={`px-5 pb-5 pt-2 border-t ${
              isDark ? 'border-slate-700/60' : 'border-slate-200/80'
            }`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

