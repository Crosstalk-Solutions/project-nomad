import classNames from "classnames";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { IconChevronDown } from "@tabler/icons-react";

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  name: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  helpText?: string;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  containerClassName?: string;
  error?: boolean;
  required?: boolean;
  disabled?: boolean;
}

const Select = <T,>({
  name,
  label,
  value,
  onChange,
  options,
  helpText,
  placeholder,
  className,
  labelClassName,
  selectClassName,
  containerClassName,
  error,
  required,
  disabled,
}: SelectProps<T>) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={classNames(className)}>
      <label
        htmlFor={name}
        className={classNames("block text-base/6 font-medium text-text-primary", labelClassName)}
      >
        {label}{required ? "*" : ""}
      </label>
      {helpText && <p className="mt-1 text-sm text-text-muted">{helpText}</p>}
      <div className={classNames("mt-1.5", containerClassName)}>
        <Listbox value={value} onChange={onChange} disabled={disabled}>
          <div className="relative">
            <ListboxButton
              id={name}
              className={classNames(
                "flex items-center w-full rounded-md bg-surface-primary px-3 py-2 text-base border border-border-default focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary sm:text-sm/6 text-left",
                selectedOption ? "text-text-primary" : "text-text-muted",
                error ? "!border-red-500 focus:outline-red-500 !bg-red-100" : "",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                selectClassName
              )}
            >
              <span className="flex-1 truncate">
                {selectedOption ? selectedOption.label : (placeholder ?? label)}
              </span>
              <IconChevronDown className="w-4 h-4 text-text-muted ml-2 shrink-0 transition-transform duration-150 group-data-[open]:rotate-180 data-[open]:rotate-180 ui-open:rotate-180" />
            </ListboxButton>

            <ListboxOptions
              transition
              anchor="bottom start"
              className={classNames(
                "z-50 w-[var(--button-width)] rounded-md bg-surface-primary border border-border-default shadow-lg max-h-60 overflow-auto",
                "transition duration-100 ease-out data-[closed]:opacity-0 data-[closed]:scale-95",
                "mt-1 focus:outline-none"
              )}
            >
              {options.map((option, index) => (
                <ListboxOption
                  key={index}
                  value={option.value}
                  disabled={option.disabled}
                  className={classNames(
                    "px-3 py-2 text-sm text-text-primary select-none",
                    option.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer data-[focus]:bg-surface-secondary data-[selected]:font-medium data-[selected]:text-primary"
                  )}
                >
                  {option.label}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
      </div>
    </div>
  );
};

export default Select;
