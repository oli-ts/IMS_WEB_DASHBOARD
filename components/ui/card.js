// components/ui/card.js
export function Card({ className = "", children }) {
  return (
    <div className={`rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children }) {
  return <div className={`px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 ${className}`}>{children}</div>;
}

export function CardContent({ className = "", children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
