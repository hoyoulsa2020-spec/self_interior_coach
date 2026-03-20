import AdminNoticesPanel from "@/components/AdminNoticesPanel";

export default function AdminNoticesConsumerPage() {
  return (
    <AdminNoticesPanel
      targetAudience="consumer"
      title="소비자 공지사항"
      description="소비자에게 보여지는 공지사항을 등록하고 관리합니다."
    />
  );
}
