import { cn } from "@/utils";

type Option<T extends string | number> = {
  value: T;
  label: string;
};

type RangeTabsProps<T extends string | number> = {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
};

export default function RangeTabs<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: RangeTabsProps<T>) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-theme-sm font-medium transition-colors",
            option.value === value
              ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
