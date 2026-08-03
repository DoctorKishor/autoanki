import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * A glassmorphic card component that expands and collapses with smooth animations.
 * 
 * @param {Object} props
 * @param {string} props.title - Title of the card.
 * @param {React.ReactNode} props.children - Expanded content.
 * @param {boolean} [props.defaultOpen=true] - Initial expand state.
 * @param {React.ComponentType} [props.icon] - Optional Lucide icon to display next to the title.
 */
export default function CollapsibleCard({ title, children, defaultOpen = true, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/10 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-blue-600" />}
          <h3 className="font-bold text-gray-900 text-sm md:text-base tracking-tight text-left">
            {title}
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="text-blue-600 shrink-0"
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
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-white/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
