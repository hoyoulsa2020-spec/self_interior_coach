import AdminNoticesPanel from "@/components/AdminNoticesPanel";

export default function AdminNoticesProviderPage() {
  return (
    <AdminNoticesPanel
      targetAudience="provider"
      title="시공업체 공지사항"
      description="시공업체에게 보여지는 공지사항을 등록하고 관리합니다."
    />
  );
}
