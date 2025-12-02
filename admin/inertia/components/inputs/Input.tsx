import classNames from "classnames";
import { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  leftIcon?: React.ReactNode;
  error?: boolean;
  required?: boolean;
}

const Input: React.FC<InputProps> = ({
  className,
  label,
  name,
  labelClassName,
  inputClassName,
  leftIcon,
  error,
  required,
  ...props
}) => {
  return (
    <div className={classNames(className)}>
      <label
        htmlFor={name}
        className={classNames("block text-base/6 font-medium text-gray-700", labelClassName)}
      >
        {label}{required ? "*" : ""}
      </label>
      <div className="mt-1.5">
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
              "block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 border border-gray-400 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-primary sm:text-sm/6",
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
