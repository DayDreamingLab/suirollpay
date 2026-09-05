import { config } from '@/lib/server/config';
export function GET() {
  return Response.json(config(), { headers: { 'Cache-Control': 'no-store' } });
}
