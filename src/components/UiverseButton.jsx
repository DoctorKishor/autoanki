import React from 'react';
import { motion } from 'framer-motion';
import { Save, Check } from 'lucide-react';

/**
 * UiverseButton Component / Neumorphic Save & Save All Button
 * Renders high-fidelity dual-theme Neumorphic Animated Save & Save All Button
 * featuring letter wave animations, gradient spin backdrops, and active success transitions.
 */
export const UiverseButton = ({
  children = 'Save',
  icon,
  onClick,
  type = 'button',
  size = 'md', // 'sm' | 'md' | 'lg'
  fullWidth = false,
  variant = 'default',
  themeMode = 'light', // 'light' | 'dark'
  isSuccess = false,
  successText = 'Saved!',
  successIcon = <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />,
  className = '',
  disabled = false,
  title,
  ...props
}) => {
  // Split label string into individual letter spans with --i delay property
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

  const sizeClass =
    size === 'lg'
      ? 'animated-save-btn-lg'
      : size === 'sm'
      ? 'animated-save-btn-sm'
      : 'animated-save-btn-md';

  const fullWidthClass = fullWidth ? 'animated-save-btn-full' : '';
  const themeClass = themeMode === 'dark' ? 'animated-save-btn-dark' : 'animated-save-btn-light';
  const successStateClass = isSuccess ? 'state-saved' : '';

  const defaultIcon = icon || <Save className="w-4 h-4 text-blue-500" />;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || isSuccess}
      title={title}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className={`animated-save-btn ${sizeClass} ${fullWidthClass} ${themeClass} ${successStateClass} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
      }`}
      {...props}
    >
      <div className="wrap">
        <div className={`state state--default ${isSuccess ? 'hidden' : 'flex'}`}>
          {defaultIcon && <div className="icon">{defaultIcon}</div>}
          <p>{renderTextSpans(children)}</p>
        </div>

        <div className={`state state--added ${isSuccess ? 'flex' : 'hidden'}`}>
          <div className="icon">{successIcon}</div>
          <p>{renderTextSpans(successText)}</p>
        </div>
      </div>
      <div className="bg"></div>
      <div className="bg-spin"></div>
      <div className="bg-gradient"></div>
    </motion.button>
  );
};

export default UiverseButton;

