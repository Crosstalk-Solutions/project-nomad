import classNames from "classnames";
import { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  helpText?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  containerClassName?: string;
  leftIcon?: React.ReactNode;
  error?: boolean;
  required?: boolean;
}

const Input: React.FC<InputProps> = ({
  className,
  label,
  name,
  helpText,
  labelClassName,
  inputClassName,
  containerClassName,
  leftIcon,
  error,
  required,
  ...props
}) => {
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
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              {leftIcon}
            </div>
          )}
          <input
            id={name}
            name={name}
            placeholder={props.placeholder || label}
            className={classNames(
              inputClassName,
              "block w-full rounded-md bg-surface-primary px-3 py-2 text-base text-text-primary border border-border-default placeholder:text-text-muted focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary sm:text-sm/6",
              leftIcon ? "pl-10" : "pl-3",
              error ? "!border-red-500 focus:outline-red-500 !bg-red-100" : ""
            )}
            {...props}
          />
        </div>
      </div>
    </div>
  );
};

export default Input;
