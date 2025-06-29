
export default function classNames(...classes: (string | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}