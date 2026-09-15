import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";

export function NotificationBell() {
  const { currentStoreId } = useCurrentStore();
  const q = useQuery({
    queryKey: ["notifs-count", currentStoreId],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return 0;
      const { data, error } = await (supabase.rpc as any)("notifications_unread_count", {
        _store: currentStoreId,
      });
      if (error) return 0;
      return Number(data ?? 0);
    },
    enabled: !!currentStoreId,
    retry: false,
    refetchInterval: 30000,
  });
  const count = q.data ?? 0;


  return (
    <Button asChild variant="ghost" size="icon" className="relative h-8 w-8" title="Notificações">
      <Link to="/pdv/notificacoes">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
