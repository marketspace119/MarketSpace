import React from 'react';

interface MarketSpaceLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg' | string;
}

export const MarketSpaceLogo: React.FC<MarketSpaceLogoProps> = ({
  className = 'h-10',
  variant = 'auto',
  showTagline = false,
  size,
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Brand Icon Emblem */}
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#0E11B7] text-white shadow-md shadow-[#0E11B7]/25 flex-shrink-0 group-hover:scale-105 transition-transform">
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-6 h-6"
        >
          {/* Shopping Bag Handle */}
          <path
            d="M14 15V12C14 8.68629 16.6863 6 20 6C23.3137 6 26 8.68629 26 12V15"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Bag Body */}
          <rect
            x="8"
            y="13"
            width="24"
            height="21"
            rx="5"
            fill="white"
            fillOpacity="0.2"
            stroke="white"
            strokeWidth="2.5"
          />
          {/* MS Emblem Letters */}
          <path
            d="M13 27V20L16 24L19 20V27"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M27 21C27 20.5 25.5 20 24 20C22.5 20 22 21 22 22C22 23.5 26.5 23.5 26.5 25C26.5 26.5 25 27 24 27C22.5 27 21 26.2 21 25.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col">
        <div className="flex items-baseline font-black tracking-tight leading-none text-2xl">
          <span className="text-[#0E11B7] dark:text-[#3B82F6]">Market</span>
          <span className="text-[#111827] dark:text-white">Space</span>
        </div>
        {showTagline && (
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase mt-0.5">
            Smart Marketplace
          </span>
        )}
      </div>
    </div>
  );
};
