export { };

declare global {
    interface Window {
        electron: {
            openNaverLogin: () => Promise<{ nidAut: string; nidSes: string } | null>;
            logoutNaver: () => Promise<boolean>;
            windowMinimize: () => void;
            windowMaximize: () => void;
            windowClose: () => void;
            windowIsMaximized: () => Promise<boolean>;
            onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
        };
    }
}
