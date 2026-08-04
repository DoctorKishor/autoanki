import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * UiverseButton Component
 * Renders Uiverse.io 00Kubi animated 3D button with Framer Motion tactile feedback & inline success confirmation.
 */
export const UiverseButton = ({
  children,
  icon,
  onClick,
  type = 'button',
  size = 'md', // 'sm' | 'md' | 'lg'
  fullWidth = false,
  variant = 'default', // 'default' | 'primary' | 'accent' | 'danger' | 'success' | 'dark' | 'light'
  themeMode = 'light', // 'light' | 'dark'
  isSuccess = false,
  successText = 'Saved!',
  successIcon = <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />,
  className = '',
  disabled = false,
  title,
  ...props
}) => {
  // Format children into animated spans with --i animation delay variables
  const renderTextSpans = (text) => {
    if (typeof text !== 'string') {
      return <span>{text}</span>;
    }

    return text.split('').map((char, index) => (
      <span key={index} style={{ '--i': index }}>
        {char === ' ' ? '\u00A0' : char}
      </span>
    ));
  };

  const sizeClass = size === 'lg' ? 'uiverse-btn-lg' : size === 'sm' ? 'uiverse-btn-sm' : '';
  const fullWidthClass = fullWidth ? 'uiverse-btn-full' : '';
  const variantClass = variant !== 'default' ? `uiverse-btn-${variant}` : '';
  const themeClass = themeMode === 'dark' ? 'uiverse-btn-dark' : 'uiverse-btn-light';
  const successClass = isSuccess ? 'uiverse-btn-success-active border-emerald-400/50' : '';

  const activeIcon = isSuccess ? successIcon : icon;
  const activeText = isSuccess ? successText : children;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || isSuccess}
      title={title}
      whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -2 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 1 }}
      className={`uiverse-00kubi-btn ${sizeClass} ${fullWidthClass} ${variantClass} ${themeClass} ${successClass} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
      }`}
      {...props}
    >
      <div className="outline"></div>
      <div className="state">
        <AnimatePresence mode="wait">
          <motion.div
            key={isSuccess ? 'success' : 'idle'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-1.5"
          >
            {activeIcon && <div className="icon">{activeIcon}</div>}
            <p className={isSuccess ? 'text-emerald-500 font-black' : ''}>
              {renderTextSpans(activeText)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.button>
  );
};

export default UiverseButton;
