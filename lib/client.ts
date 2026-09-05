'use client';
import type { ActionResults } from './domain/api-types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  PublicConfig,
  Contractor,
  PayrollRun,
  Organization,
  Operation,
} from './domain/types';
export type WorkspaceData = {
  organization: Organization;
  user: { id: string; email: string };
  contractors: Contractor[];
  runs: PayrollRun[];
  activity: {
    id: string;
    action: string;
    created_at: string;
    run_id?: string;
  }[];
  operations: Operation[];
  members: { user_id: string; role: string }[];
};
let client: SupabaseClient;
export function auth(c?: PublicConfig) {
  if (!client && c) client = createClient(c.supabaseUrl, c.supabaseKey);
  return client;
}
export async function api<T = unknown>(
  path: string,
  data?: unknown,
): Promise<T> {
  const session = await client?.auth.getSession();
  const response = await fetch(path, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.data.session
        ? { Authorization: `Bearer ${session.data.session.access_token}` }
        : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || 'Request failed. Please retry.');
  return result;
}
export function action<K extends keyof ActionResults>(
  name: K,
  data: unknown = {},
): Promise<ActionResults[K]> {
  return api<ActionResults[K]>('/api/actions', { action: name, data });
}
export function short(address: string) {
  return address
    ? address.slice(0, 6) + '…' + address.slice(-4)
    : 'Not configured';
}
export function download(name: string, text: string, type = 'text/csv') {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type }));
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? '');
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" : '') +
    text.replaceAll('"', '""') +
    '"'
  );
}
