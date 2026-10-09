import React, { useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { isoToDmy, maskDmy, parseDmy } from "../utils/dateUtils";

interface DateFieldProps {
  id: string;
  /** YYYY-MM-DD, or '' while the typed text is not a complete valid date */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest date the calendar popup allows (YYYY-MM-DD) */
  min?: string;
  required?: boolean;
  className?: string;
}

/**
 * Date input that always reads and shows dd/mm/yyyy, whatever the browser's language is
 * (the native date input follows the device locale and cannot be forced).
 * Type the date, or use the calendar button. A Buddhist-era year (08/10/2569) is accepted.
 */
export const DateField: React.FC<DateFieldProps> = ({
  id,
  value,
  onChange,
  min,
  required,
  className = "",
}) => {
  const [draft, setDraft] = useState(() => isoToDmy(value));
  const [lastValue, setLastValue] = useState(value);
  const [touched, setTouched] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // The value was changed from outside (e.g. the end date follows the start date)
  if (value !== lastValue) {
    setLastValue(value);
    if (parseDmy(draft) !== value) setDraft(isoToDmy(value));
  }

  const invalid =
    draft !== "" && parseDmy(draft) === "" && (touched || draft.length === 10);

  const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = maskDmy(e.target.value);
    setDraft(text);
    onChange(parseDmy(text));
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  };

  return (
    <div>
      <div className="relative">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required={required}
            placeholder="วว/ดด/ปปปป"
            maxLength={10}
            value={draft}
            onChange={handleType}
            onBlur={() => {
              setTouched(true);
              // Show a Buddhist-era year or a half-typed date back as the date it was understood as
              if (parseDmy(draft)) setDraft(isoToDmy(parseDmy(draft)));
            }}
            aria-invalid={invalid}
            className={`w-full text-base border rounded-lg pl-3 pr-10 py-2.5 bg-white focus:outline-hidden focus:ring-2 font-mono ${
              invalid
                ? "border-rose-400 focus:ring-rose-400"
                : "border-slate-300 focus:ring-blue-500"
            } ${className}`}
          />
          <button
            type="button"
            onClick={openPicker}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
            title="เลือกจากปฏิทิน"
            aria-label="เลือกวันที่จากปฏิทิน"
          >
            <Calendar className="w-4 h-4" />
          </button>
          {/* The browser's own calendar, used only as a popup: it never shows its own text */}
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            value={value}
            min={min}
            onChange={(e) => {
              if (!e.target.value) return;
              setDraft(isoToDmy(e.target.value));
              onChange(e.target.value);
            }}
            className="absolute right-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
          />
      </div>
      {invalid && (
        <p className="text-xs text-rose-600 mt-0.5">
          วันที่ไม่ถูกต้อง ใช้รูปแบบ วว/ดด/ปปปป เช่น 08/10/2026
        </p>
      )}
    </div>
  );
};
