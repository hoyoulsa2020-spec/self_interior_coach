"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ConsumerProviderChatEndedPage from "@/components/ConsumerProviderChatEndedPage";

export default function DashboardProviderChatEndedPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
      else window.location.href = "/login";
    });
  }, []);

  if (!userId) return <div className="flex h-64 items-center justify-center text-gray-500">로딩 중...</div>;
  return <ConsumerProviderChatEndedPage userRole="consumer" userId={userId} />;
}
