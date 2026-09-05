'use client';
import type { TreasuryState, IntegrationState } from '@/lib/domain/api-types';
import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  RefreshCw,
  ShieldCheck,
  Copy,
  Download,
  CheckCircle2,
} from 'lucide-react';
import type { PublicConfig, PayrollRun } from '@/lib/domain/types';
import type { WorkspaceData } from '@/lib/client';
import { action, auth, short, download, csvCell } from '@/lib/client';
import { display, decimal } from '@/lib/domain/money';
import {
  Status,
  DataTable,
  Row,
  Cell,
  EmptyState,
  Field,
  Choice,
  Busy,
} from './common';
export function Treasury({
  config,
  demo,
  notify,
}: {
  config: PublicConfig;
  demo: boolean;
  notify: (s: string) => void;
}) {
  const [balance, setBalance] = useState<TreasuryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (demo) return;
    setBusy(true);
    setError('');
    try {
      setBalance(await action('treasury'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [demo]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return (
    <div className="stack">
      <section className="panel">
        <div className="split-head">
          <div className="actions">
            <Wallet size={22} />
            <h2>Organization treasury</h2>
          </div>
          <button
            className="secondary"
            disabled={busy || demo}
            onClick={refresh}
          >
            <RefreshCw size={16} /> Refresh balance
          </button>
        </div>
        {error && <div className="notice error">{error}</div>}
        {busy ? (
          <Busy text="Checking treasury…" />
        ) : (
          <>
            <div className="amount">
              {balance ? display(balance.stablecoin, config.decimals) : '—'}{' '}
              <span style={{ fontSize: 18 }}>USDC</span>
            </div>
            <p className="muted">Available for contractor payroll</p>
          </>
        )}
        <div className="detail-line">
          <span>Treasury wallet</span>
          <div className="actions">
            <b>{short(config.treasury)}</b>
            <button
              aria-label="Copy treasury address"
              onClick={() =>
                navigator.clipboard
                  .writeText(config.treasury)
                  .then(() => notify('Address copied.'))
              }
            >
              <Copy size={15} />
            </button>
          </div>
        </div>
        <div className="detail-line">
          <span>Settlement network</span>
          <span className="badge">Sui {config.network}</span>
        </div>
        <div className="detail-line">
          <span>Payment authorization</span>
          <span>
            {balance
              ? balance.authorized
                ? 'Treasury verified'
                : 'Needs attention'
              : 'Not checked'}
          </span>
        </div>
        <div className="detail-line">
          <span>Registry status</span>
          <span>
            {balance
              ? balance.paused
                ? 'Paused'
                : balance.registryValid
                  ? 'Available'
                  : 'Needs attention'
              : 'Not checked'}
          </span>
        </div>
      </section>
      <div className="two-col">
        <section className="panel">
          <ShieldCheck className="text-primary" size={25} />
          <h2 style={{ margin: '15px 0' }}>You stay in control</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Suiroll prepares payments and verifies the amounts. Only your
            authorized wallet can sign and release funds.
          </p>
        </section>
        <section className="panel">
          <h2>Before your next payroll</h2>
          <div className="check-list">
            <p>
              <CheckCircle2 size={16} /> Fund the treasury with testnet USDC
            </p>
            <p>
              <CheckCircle2 size={16} /> Keep SUI available for payment fees
            </p>
            <p>
              <CheckCircle2 size={16} /> Review all contractor wallet addresses
            </p>
          </div>
        </section>
      </div>
      <details className="panel">
        <summary>Advanced treasury details</summary>
        <div className="detail-line">
          <span>SUI balance</span>
          <b>{balance ? decimal(balance.sui, 9) : '—'} SUI</b>
        </div>
        <p className="mono">
          Wallet: {config.treasury}
          <br />
          Coin type: {config.coinType}
          <br />
          Package: {config.packageId}
          <br />
          Registry: {config.registryId}
        </p>
      </details>
    </div>
  );
}
export function Reconciliation({
  runs,
  onRun,
}: {
  runs: PayrollRun[];
  onRun: (id: string) => void;
}) {
  const settled = runs.filter((r) =>
    ['PAID', 'SUBMITTED', 'FAILED'].includes(r.status),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Settlement ledger</h2>
        <button
          className="secondary"
          disabled={!settled.length}
          onClick={() =>
            download(
              'suiroll-reconciliation.csv',
              [
                ['Payroll', 'Period', 'Status', 'USDC', 'Digest', 'Plan hash']
                  .map(csvCell)
                  .join(','),
                ...settled.map((r) =>
                  [
                    r.name,
                    r.period,
                    r.status,
                    r.plan ? decimal(r.plan.total, r.plan.decimals) : '',
                    r.digest,
                    r.plan?.hash,
                  ]
                    .map(csvCell)
                    .join(','),
                ),
              ].join('\n'),
            )
          }
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      {settled.length ? (
        <DataTable
          headers={['Payroll', 'Total', 'Settlement', 'Transaction', '']}
        >
          {settled.map((r) => (
            <Row key={r.id}>
              <Cell>
                {r.name}
                <small>{r.period}</small>
              </Cell>
              <Cell>
                {r.plan ? display(r.plan.total, r.plan.decimals) : '—'} USDC
              </Cell>
              <Cell>
                <Status value={r.status} />
              </Cell>
              <Cell className="mono">{short(r.digest || '')}</Cell>
              <Cell>
                <button className="text-link" onClick={() => onRun(r.id)}>
                  View details
                </button>
              </Cell>
            </Row>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="A clear record of every payment"
          description="After payment, Suiroll verifies each recipient amount and registry event against your approved plan."
        />
      )}
    </section>
  );
}
export function Insights({ data }: { data: WorkspaceData }) {
  const paid = data.runs.filter((r) => r.status === 'PAID');
  const warnings = data.runs
    .flatMap((r) => r.findings)
    .filter((f) => f.severity === 'WARN');
  const duplicates = warnings.filter((f) => f.code === 'DUPLICATE');
  return (
    <div className="stack">
      <div className="metrics">
        <article className="metric">
          <div>Completed payroll runs</div>
          <strong>{paid.length}</strong>
          <small>Verified settlements</small>
        </article>
        <article className="metric">
          <div>Duplicate invoices flagged</div>
          <strong>{duplicates.length}</strong>
          <small>Excluded before payment</small>
        </article>
        <article className="metric">
          <div>Review findings</div>
          <strong>{warnings.length}</strong>
          <small>Visible before approval</small>
        </article>
        <article className="metric">
          <div>AI operations completed</div>
          <strong>
            {data.operations.filter((o) => o.status === 'COMPLETED').length}
          </strong>
          <small>Validated and checkpointed</small>
        </article>
      </div>
      <section className="panel">
        <h2>What needs your attention</h2>
        {data.runs.some((r) => r.findings.length) ? (
          data.runs
            .filter((r) => r.findings.length)
            .map((r) => (
              <div className="activity" key={r.id}>
                <ShieldCheck size={20} />
                <div>
                  <h3>{r.name}</h3>
                  {r.findings.map((f, i) => (
                    <p className="muted" key={i}>
                      {f.message}
                    </p>
                  ))}
                </div>
              </div>
            ))
        ) : (
          <EmptyState
            title="No outstanding findings"
            description="Policy checks and source insights will appear as you prepare payroll."
          />
        )}
      </section>
    </div>
  );
}
export function Settings({
  data,
  config,
  demo,
  refresh,
  notify,
  theme,
  setTheme,
}: {
  data: WorkspaceData;
  config: PublicConfig;
  demo: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  theme: string;
  setTheme: (s: string) => void;
}) {
  const [name, setName] = useState(data.organization.name);
  const [limit, setLimit] = useState(data.organization.max_payment);
  const [integrations, setIntegrations] = useState<IntegrationState | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function work(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <h2>Workspace & payroll policy</h2>
        <form
          className="fields"
          style={{ marginTop: 22 }}
          onSubmit={(e) => {
            e.preventDefault();
            void work(async () => {
              await action('settings', { name, max_payment: limit });
              await refresh();
              notify('Workspace settings saved.');
            });
          }}
        >
          <div className="two-col">
            <Field label="Workspace name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Maximum payment per contractor (USDC)">
              <input
                required
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
          </div>
          <small>
            Payments above this limit are blocked. Changes apply when new
            payroll plans are prepared.
          </small>
          <div>
            <button
              className="primary"
              disabled={
                busy ||
                demo ||
                !['owner', 'admin'].includes(data.organization.role)
              }
            >
              Save settings
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Appearance</h2>
        <div style={{ maxWidth: 300, marginTop: 18 }}>
          <Choice
            value={theme}
            label="Color theme"
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Integrations</h2>
          <button
            className="secondary"
            disabled={busy || demo}
            onClick={() =>
              work(async () => setIntegrations(await action('integrations')))
            }
          >
            Check connections
          </button>
        </div>
        {busy && <Busy text="Checking connections…" />}
        {[
          [
            'Supabase',
            'Private data, authentication & storage',
            integrations?.supabase,
          ],
          ['Gonka', 'Focused payroll interpretation', integrations?.gonka],
          [
            'Sui',
            `${config.network} settlement · Wallet authorization`,
            undefined,
          ],
        ].map(([title, sub, ok]) => (
          <div className="detail-line" key={String(title)}>
            <div>
              <b>{title}</b>
              <small>{sub}</small>
            </div>
            <span className="badge neutral">
              {ok === true
                ? 'Connected'
                : ok === false
                  ? 'Needs attention'
                  : 'Configured'}
            </span>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          API secrets are managed on the server. They are never sent to the
          browser.
        </p>
      </section>
      <section className="panel">
        <h2>Team & permissions</h2>
        <p className="muted" style={{ fontSize: 14, margin: '12px 0' }}>
          Your role: {data.organization.role}. Owners and admins prepare
          payroll; approvers authorize payments; viewers have read access.
        </p>
        {data.members.map((m) => (
          <div className="detail-line" key={m.user_id}>
            <span>
              {m.user_id === data.user.id ? data.user.email : short(m.user_id)}
            </span>
            {data.organization.role === 'owner' &&
            m.user_id !== data.user.id ? (
              <Choice
                value={m.role}
                label="Team role"
                options={['admin', 'approver', 'viewer'].map((x) => ({
                  value: x,
                  label: x,
                }))}
                onChange={(role) =>
                  work(async () => {
                    await action('setRole', { userId: m.user_id, role });
                    await refresh();
                  })
                }
              />
            ) : (
              <span className="badge neutral">{m.role}</span>
            )}
          </div>
        ))}
        <small>
          Additional members can be provisioned by the project administrator in
          Supabase. Invitations are not enabled in this hackathon build.
        </small>
      </section>
      {!demo && (
        <section className="panel">
          <h2>Account security</h2>
          <form
            className="fields"
            style={{ marginTop: 18 }}
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                const { error } = await auth().auth.updateUser({ password });
                if (error) throw error;
                setPassword('');
                notify('Password updated.');
              });
            }}
          >
            <Field label="New password">
              <input
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="actions">
              <button className="secondary" disabled={busy}>
                Update password
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => auth().auth.signOut()}
              >
                Sign out
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
