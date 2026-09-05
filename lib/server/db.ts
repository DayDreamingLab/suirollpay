import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Organization, Role } from '../domain/types';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function db() {
  const c = config();
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !c.supabaseUrl)
    throw new AppError(
      'Supabase setup is incomplete. Check the integration settings.',
      503,
    );
  return createClient(c.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function checked<T>(result: {
  data: T;
  error: { code?: string; message?: string } | null;
}): NonNullable<T> {
  if (result.error) {
    if (['42P01', 'PGRST205', 'PGRST202'].includes(result.error.code || ''))
      throw new AppError(
        'Database setup required. Apply the Suiroll SQL migration in Supabase.',
        503,
      );
    throw new AppError(
      'The database could not complete this request. Please retry.',
      503,
    );
  }
  return result.data as NonNullable<T>;
}
export async function identity(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new AppError('Sign in to access your workspace.', 401);
  const client = db();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new AppError('Your session expired. Please sign in again.', 401);
  return { client, user: data.user };
}
export async function context(
  req: Request,
  roles: Role[] = ['owner', 'admin', 'approver', 'viewer'],
) {
  const { client, user } = await identity(req);
  const membership = checked(
    await client
      .from('memberships')
      .select('organization_id,role,organizations(*)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
  );
  if (!membership) throw new AppError('Create a workspace to continue.', 409);
  if (!roles.includes(membership.role as Role))
    throw new AppError('Your workspace role does not allow this action.', 403);
  const organization = {
    ...(membership.organizations as unknown as Organization),
    role: membership.role as Role,
  };
  return { client, user, organization };
}
export async function audit(
  client: ReturnType<typeof db>,
  org: string,
  user: string,
  action: string,
  runId?: string,
  metadata: Record<string, unknown> = {},
) {
  checked(
    await client.from('audit_logs').insert({
      organization_id: org,
      user_id: user,
      action,
      run_id: runId,
      metadata,
    }),
  );
}
export async function body(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 4_000_000)
    throw new AppError('Upload is too large.', 413);
  const text = await req.text();
  if (text.length > 4_000_000) throw new AppError('Upload is too large.', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('Request data is invalid.');
  }
}
export function route(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const result = await fn(req);
      return Response.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      const message =
        e instanceof AppError
          ? e.message
          : e instanceof Error && e.name === 'ZodError'
            ? 'Please check the required fields.'
            : 'This operation could not be completed. Please retry or check the integration settings.';
      console.info(
        JSON.stringify({
          event: 'request_failed',
          status: e instanceof AppError ? e.status : 500,
          type: e instanceof Error ? e.name : 'unknown',
        }),
      );
      return Response.json(
        { error: message },
        {
          status: e instanceof AppError ? e.status : 500,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
  };
}
