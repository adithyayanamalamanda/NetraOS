import React from 'react';

interface GoogleIconProps {
  name: string;
  className?: string;
  size?: number | string;
  filled?: boolean;
  style?: React.CSSProperties;
}

export const GoogleIcon: React.FC<GoogleIconProps> = ({
  name,
  className = '',
  size = 20,
  filled = false,
  style = {}
}) => {
  return (
    <span
      className={`material-symbols-outlined select-none transition-transform duration-200 inline-flex items-center justify-center ${className}`}
      style={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
        ...style
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
};
