import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface DropdownGroup {
  group: string;
  items: string[];
}

interface DropdownSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | DropdownGroup)[];
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
  hint?: string;
  icon?: React.ReactNode;
  /** For optional fields: text of a first row that clears the choice (e.g. "ไม่ระบุ") */
  clearLabel?: string;
}

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'เลือกรายการ',
  required = false,
  searchable = true,
  hint,
  icon,
  clearLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, searchable]);

  // Helper to check if an option is a group
  const isGroup = (opt: string | DropdownGroup): opt is DropdownGroup => {
    return typeof opt === 'object' && opt !== null && 'group' in opt;
  };

  // Filter options based on search query
  const q = searchQuery.trim().toLowerCase();
  
  const filteredOptions = options.reduce<(string | DropdownGroup)[]>((acc, opt) => {
    if (isGroup(opt)) {
      const matchedItems = opt.items.filter(item => 
        !q || item.toLowerCase().includes(q)
      );
      if (matchedItems.length > 0) {
        acc.push({ group: opt.group, items: matchedItems });
      }
    } else {
      if (!q || opt.toLowerCase().includes(q)) {
        acc.push(opt);
      }
    }
    return acc;
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Label and Hint */}
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
          {icon}
          <span>{label}</span>
          {required && <span className="text-rose-500 font-bold">*</span>}
        </label>
        {hint && (
          <span className="text-[11px] text-slate-500 font-normal">
            {hint}
          </span>
        )}
      </div>

      {/* Trigger Button - Looks like a clean input */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left text-xs sm:text-sm border rounded-lg px-3 py-2 bg-white flex items-center justify-between gap-2 transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate font-medium ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Popup Menu - ALWAYS STRICTLY BELOW (top-full mt-1.5) */}
      {isOpen && (
        <div 
          className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-50 slide-in-from-top-2 duration-150"
          style={{ minWidth: '100%' }}
        >
          {/* Optional Search Input */}
          {searchable && (
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="พิมพ์เพื่อค้นหา..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-transparent border-0 focus:outline-hidden text-slate-800 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Options List */}
          <div className="max-h-56 sm:max-h-64 overflow-y-auto p-1 divide-y divide-slate-50">
            {clearLabel && !q && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer italic ${
                  value === '' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span>{clearLabel}</span>
                {value === '' && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                ไม่พบข้อมูล &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((opt, optIdx) => {
                if (isGroup(opt)) {
                  return (
                    <div key={`group-${optIdx}`} className="py-1">
                      {/* Group Header */}
                      <div className="px-2.5 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 rounded-md">
                        {opt.group}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {opt.items.map((item) => {
                          const isSelected = item === value;
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => handleSelect(item)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-700 font-bold'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span>{item}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
