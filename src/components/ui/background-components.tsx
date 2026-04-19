import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Component = ({ children, className }: { children?: ReactNode; className?: string }) => {
  return (
    <div className={cn("min-h-screen w-full relative", className)} style={{ background: '#F0F4F8' }}>
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 10%, #BCD4E9 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, #CCDBD1 0%, transparent 45%)
          `,
          opacity: 0.55,
        }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
};
