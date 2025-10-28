"use client";
import { Toaster } from "sonner";


export default function Providers({ children }) {
return (
<>
{children}
<Toaster richColors position="top-right" />
</>
);
}