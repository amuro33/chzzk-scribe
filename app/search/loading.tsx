import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex-1 ml-16 flex flex-col">
        <PageHeader
          title="VOD 검색"
          subtitle="스트리머를 검색하고 VOD를 탐색하세요"
        />
        <div className="flex-1 p-6 overflow-hidden">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded-lg w-full"></div>
            <div className="grid grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-[280px] bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
