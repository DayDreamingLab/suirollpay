import { route, context, checked } from '@/lib/server/db';
export const GET = route(async (req) => {
  const { client, organization, user } = await context(req);
  const results = await Promise.all([
    client
      .from('contractors')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false }),
    client
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false }),
    client
      .from('audit_logs')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(40),
    client
      .from('ai_operations')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('memberships')
      .select('user_id,role')
      .eq('organization_id', organization.id),
  ]);
  return {
    organization,
    user: { id: user.id, email: user.email },
    contractors: checked(results[0]),
    runs: checked(results[1]),
    activity: checked(results[2]),
    operations: checked(results[3]),
    members: checked(results[4]),
  };
});
