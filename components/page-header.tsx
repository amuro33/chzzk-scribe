"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    className?: string;
}

export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
    return (
        <div className={cn("mb-8 flex justify-start", className)}>
            <div className="flex items-center gap-4">
                <span className="text-5xl font-light bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent leading-none select-none pb-1">{`{`}</span>
                <div className="flex flex-col items-start">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent leading-tight tracking-tight text-left" style={{ fontFamily: "'Paperlogy', sans-serif" }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="mt-1 text-base text-muted-foreground font-medium text-left">
                            {subtitle}
                        </p>
                    )}
                </div>
                <span className="text-5xl font-light bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent leading-none select-none pb-1">{`}`}</span>
            </div>
        </div>
    );
}
