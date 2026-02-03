import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex-1 ml-16 flex flex-col">
        <PageHeader
          title="다운로드 기록"
          subtitle="다운로드한 파일들을 관리하세요"
        />
        <div className="flex-1 p-6 overflow-hidden">
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[80px] bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
