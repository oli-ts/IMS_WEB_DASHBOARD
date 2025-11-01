import "./globals.css";
import Providers from "./providers";
import LayoutFrame from "../components/LayoutFrame";

export const metadata = {
  title: "LoadOut - Concrete Polishing Group",
  description: "Inventory System, built by TradeScale",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              try {
                const ls = localStorage.getItem('theme');
                const m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                const root = document.documentElement;
                root.classList.remove('light','dark');
                if (ls === 'light' || ls === 'dark') {
                  root.classList.add(ls);
                } else {
                  // 'system' or unset: add 'dark' class only if system prefers dark for initial paint
                  if (m) root.classList.add('dark');
                }
              } catch (_) {}
            })();
          `,
          }}
        />
      </head>
      <body className={`antialiased`}>
        <Providers>
          <LayoutFrame>{children}</LayoutFrame>
        </Providers>
      </body>
    </html>
  );
}
