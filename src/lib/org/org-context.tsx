import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { listMyOrganizations, listRolePermissions } from "./organizations.functions";
import type { AppRole } from "@/lib/rbac";

export type Organization = {
  organization_id: string;
  name: string;
  slug: string;
  role: AppRole;
};

type OrgContextValue = {
  organizations: Organization[];
  currentOrganization: Organization | null;
  setCurrentOrganization: (organizationId: string) => void;
  role: AppRole | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);
const STORAGE_KEY = "estrategia.currentOrganizationId";

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const fetchOrgs = useServerFn(listMyOrganizations);
  const fetchPermissions = useServerFn(listRolePermissions);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => fetchOrgs(),
  });

  const permissionsQuery = useQuery({
    queryKey: ["role-permissions"],
    queryFn: () => fetchPermissions(),
  });

  const organizations = (orgsQuery.data ?? []) as Organization[];

  useEffect(() => {
    if (!organizations.length) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const valid = organizations.find((o) => o.organization_id === (currentId ?? stored));
    const next = valid ?? organizations[0];
    if (next && next.organization_id !== currentId) setCurrentId(next.organization_id);
  }, [organizations, currentId]);

  const currentOrganization = organizations.find((o) => o.organization_id === currentId) ?? null;

  const permissions = useMemo(() => {
    if (!currentOrganization) return [];
    return (permissionsQuery.data ?? [])
      .filter((row) => row.role === currentOrganization.role)
      .map((row) => row.permission);
  }, [permissionsQuery.data, currentOrganization]);

  const value: OrgContextValue = {
    organizations,
    currentOrganization,
    setCurrentOrganization: (organizationId: string) => {
      setCurrentId(organizationId);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, organizationId);
    },
    role: currentOrganization?.role ?? null,
    permissions,
    hasPermission: (permission: string) => permissions.includes(permission),
    isLoading: orgsQuery.isLoading || permissionsQuery.isLoading,
    error: (orgsQuery.error as Error | null) ?? null,
    refetch: () => {
      void orgsQuery.refetch();
      void permissionsQuery.refetch();
    },
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrganization deve ser usado dentro de OrganizationProvider");
  return ctx;
}
