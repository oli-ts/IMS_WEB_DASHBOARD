export function Label({ children, htmlFor, className = "" }) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium ${className}`}>
      {children}
    </label>
  );
}
