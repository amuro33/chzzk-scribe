import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { User, LogOut } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function NaverLoginButton() {
    const { naverCookies, setNaverCookies } = useAppStore();
    const [showLogoutAlert, setShowLogoutAlert] = useState(false);

    const handleButtonClick = () => {
        if (naverCookies) {
            setShowLogoutAlert(true);
        } else {
            handleLogin();
        }
    };

    const handleLogin = async () => {
        if (typeof window !== 'undefined' && (window as any).electron) {
            try {
                toast.info("네이버 로그인 창을 엽니다...");
                const cookies = await (window as any).electron.openNaverLogin();
                if (cookies) {
                    // Store in encrypted storage
                    const saved = await (window as any).electron.encryptAndSaveCookies(cookies);
                    if (saved) {
                        setNaverCookies(cookies);
                        toast.success("네이버 로그인 성공! (암호화 저장됨)");
                    } else {
                        // Fallback: store in memory only (won't persist across restarts)
                        setNaverCookies(cookies);
                        toast.warning("로그인 성공 (암호화 저장 실패, 재시작 시 재로그인 필요)");
                    }
                } else {
                    toast.error("네이버 로그인 취소 또는 실패");
                }
            } catch (e) {
                console.error(e);
                toast.error("로그인 중 오류 발생");
            }
        } else {
            toast.error("Electron 환경이 아닙니다.");
        }
    };

    const handleLogout = async () => {
        if (typeof window !== 'undefined' && (window as any).electron) {
            try {
                await (window as any).electron.logoutNaver();
                // Clear encrypted storage
                await (window as any).electron.clearEncryptedCookies();
                setNaverCookies(null);
                toast.success("로그아웃 되었습니다.");
            } catch (e) {
                console.error(e);
                toast.error("로그아웃 실패");
            }
        }
    };

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleButtonClick}
                className={cn(
                    "h-7 px-2 text-xs font-medium gap-1.5 transition-colors",
                    "hover:bg-muted/50",
                    naverCookies
                        ? "text-green-500 hover:text-green-600 hover:bg-green-500/10"
                        : "text-muted-foreground hover:text-foreground"
                )}
                title={naverCookies ? "네이버 로그인됨 (클릭하여 로그아웃)" : "네이버 로그인 (연령제한 컨텐츠용)"}
            >
                {naverCookies ? (
                    <>
                        <div className="relative">
                            <User className="h-3.5 w-3.5" />
                            <div className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-green-500 ring-1 ring-background animate-pulse" />
                        </div>
                        <span className="hidden sm:inline">로그인됨</span>
                    </>
                ) : (
                    <>
                        <User className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">로그인</span>
                    </>
                )}
            </Button>

            <AlertDialog open={showLogoutAlert} onOpenChange={setShowLogoutAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>로그아웃 하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            저장된 네이버 로그인 쿠키가 삭제됩니다.
                            <br />
                            다시 로그인하려면 네이버 아이디로 로그인해야 합니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            로그아웃
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
