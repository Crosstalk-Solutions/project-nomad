import { useRef, useEffect } from "react";

const useDebounce = () => {
  const timeout = useRef<number | undefined>(400);

  const debounce =
    (func: Function, wait: number = 0) =>
    (...args: any[]) => {
      clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => func(...args), wait);
    };

  useEffect(() => {
    return () => {
      if (!timeout.current) return;
      clearTimeout(timeout.current);
    };
  }, []);

  return { debounce };
};

export default useDebounce;
