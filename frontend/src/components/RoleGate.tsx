import React from 'react';
import { useRbac } from '../hooks/useRbac';

interface RoleGateProps {
  feature: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children only if the current user has the required permission.
 */
export function RoleGate({ feature, action, children, fallback = null }: RoleGateProps) {
  const { can } = useRbac();
  return can(feature, action) ? <>{children}</> : <>{fallback}</>;
}
