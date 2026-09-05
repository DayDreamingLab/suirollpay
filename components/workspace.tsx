'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { createDAppKit, DAppKitProvider } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import {
  Plus,
  LayoutDashboard,
  Layers,
  Users,
  Wallet,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  CircleHelp,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  LogIn,
  Activity,
} from 'lucide-react';
import type { PublicConfig } from '@/lib/domain/types';
import { api, auth, type WorkspaceData } from '@/lib/client';
import { demoData } from '@/lib/demo';
import { display } from '@/lib/domain/money';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Status, DataTable, Row, Cell, EmptyState, Modal } from './common';
import { AuthScreen } from './auth-screen';
import { Contractors } from './contractors';
import { PayrollCreate } from './payroll-create';
import { PayrollReview } from './payroll-review';
import {
  Treasury,
  Reconciliation,
  Insights,
  Settings,
} from './secondary-views';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'payroll', label: 'Payroll Runs', icon: Layers },
  { id: 'contractors', label: 'Contractors', icon: Users },
  { id: 'treasury', label: 'Treasury', icon: Wallet },
  { id: 'reconciliation', label: 'Reconciliation', icon: ArrowLeftRight },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
export function Workspace() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<PublicConfig>)
      .then((c) => {
        auth(c);
        setConfig(c);
      })
      .catch(() =>
        setError(
          'Workspace configuration could not be loaded. Refresh to retry.',
        ),
      );
  }, []);
  if (error)
    return (
      <main>
        <div className="notice error">{error}</div>
      </main>
    );
  if (!config)
    return (
      <main aria-label="Loading workspace">
        <Skeleton className="h-10 w-48 mb-8" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  return <WalletProvider config={config} />;
}
function WalletProvider({ config }: { config: PublicConfig }) {
  const kit = useMemo(
    () =>
      createDAppKit({
        networks: [config.network],
        createClient: (network) =>
          new SuiGrpcClient({ network, baseUrl: config.rpcUrl }),
      }),
    [config.network, config.rpcUrl],
  );
  return (
    <DAppKitProvider dAppKit={kit}>
      <App config={config} />
    </DAppKitProvider>
  );
}
function App({ config }: { config: PublicConfig }) {
  const [data, setData] = useState<WorkspaceData>(demoData);
  const [session, setSession] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [view, setView] = useState(() =>
    typeof window === 'undefined'
      ? 'overview'
      : location.pathname.split('/').filter(Boolean)[0] || 'overview',
  );
  const [runId, setRunId] = useState<string | null>(() =>
    typeof window !== 'undefined' && location.pathname.startsWith('/payroll/')
      ? location.pathname.split('/')[2]
      : null,
  );
  const [create, setCreate] = useState(false);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [theme, setThemeState] = useState(() =>
    typeof window === 'undefined'
      ? 'light'
      : localStorage.getItem('suiroll-theme') || 'light',
  );
  const demo = !session || data.organization.id === 'demo';
  const canEdit = !demo && ['owner', 'admin'].includes(data.organization.role);
  const canApprove =
    !demo && ['owner', 'admin', 'approver'].includes(data.organization.role);
  const refresh = useCallback(async () => {
    const current = (await auth().auth.getSession()).data.session;
    setSession(!!current);
    if (!current) {
      setData(demoData());
      setLoaded(true);
      setNeedsWorkspace(false);
      return;
    }
    try {
      const result = await api<WorkspaceData>('/api/data');
      setData(result);
      setNeedsWorkspace(false);
      setError('');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Create a workspace')) setNeedsWorkspace(true);
      else setError(msg);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void auth()
      .auth.getSession()
      .then(() => refresh());
    const {
      data: { subscription },
    } = auth().auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    const route = () => {
      const parts = location.pathname.split('/').filter(Boolean);
      setView(parts[0] || 'overview');
      setRunId(parts[0] === 'payroll' && parts[1] ? parts[1] : null);
    };
    window.addEventListener('popstate', route);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('popstate', route);
    };
  }, [refresh]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && media.matches),
      );
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  function setTheme(v: string) {
    setThemeState(v);
    localStorage.setItem('suiroll-theme', v);
  }
  function go(id: string, run?: string) {
    setView(id);
    setRunId(run || null);
    history.pushState(
      {},
      '',
      id === 'overview' ? '/' : `/${id}${run ? '/' + run : ''}`,
    );
    window.scrollTo(0, 0);
  }
  const notify = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 6000);
  };
  const onRun = (id: string) => go('payroll', id);
  const selected = data.runs.find((r) => r.id === runId);
  const title =
    navigation.find((n) => n.id === view)?.label || 'Your workspace';
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '236px' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader className="px-5 pt-7">
          <Link
            href="/"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go('overview');
            }}
          >
            ◈ suiroll
          </Link>
          <div className="org">
            {data.organization.name}
            <small>{demo ? 'Sample workspace' : 'Payroll operations'}</small>
          </div>
          <p className="eyebrow pl-3">Workspace</p>
        </SidebarHeader>
        <SidebarContent className="px-5">
          <SidebarMenu>
            {navigation.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={view === n.id}
                  onClick={() => go(n.id)}
                  className="h-11 gap-3 text-sm px-3"
                >
                  <n.icon size={18} />
                  <span>{n.label}</span>
                  {n.id === 'payroll' &&
                    data.runs.filter((r) => r.status === 'PREPARED').length >
                      0 && (
                      <span className="badge ml-auto">
                        {
                          data.runs.filter((r) => r.status === 'PREPARED')
                            .length
                        }
                      </span>
                    )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="px-6 pb-7">
          <button className="text-link actions" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> Help & workflow
          </button>
          <div className="rail-bottom">
            <span className="dot" /> Sui {config.network}
            <small>AI prepares. You approve.</small>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <header className="topbar">
          <div className="actions">
            <SidebarTrigger aria-label="Toggle navigation" />
            <span>
              Workspace <span className="muted"> / {title}</span>
            </span>
          </div>
          <div className="top-actions">
            <span className="badge neutral">{config.network}</span>
            <ConnectButton />
            {demo && (
              <button className="secondary" onClick={() => go('auth')}>
                <LogIn size={16} /> Sign in
              </button>
            )}
          </div>
        </header>
        <main>
          {!loaded ? (
            <>
              <Skeleton className="h-10 w-52 mb-8" />
              <Skeleton className="h-72" />
            </>
          ) : view === 'auth' || needsWorkspace ? (
            <AuthScreen
              needsWorkspace={needsWorkspace}
              onDone={() => {
                void refresh();
                go('overview');
              }}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view === 'overview'
                      ? 'Your payroll, in perspective'
                      : 'Payroll operations'}
                  </p>
                  <h1>{selected ? 'Payroll review' : title}</h1>
                  <p className="muted">
                    {
                      (
                        {
                          overview:
                            'Everything you need for a considered payday.',
                          payroll:
                            'From source data to settled payments, in one clear flow.',
                          contractors: 'The people behind your next payroll.',
                          treasury:
                            'A clear view of your funds and payment readiness.',
                          reconciliation:
                            'Every transfer accounted for. Every amount verified.',
                          insights:
                            'Useful signals from your payroll operations.',
                          settings:
                            'Your workspace, policies, and connections.',
                        } as Record<string, string>
                      )[view]
                    }
                  </p>
                </div>
                {['overview', 'payroll'].includes(view) && !selected && (
                  <button
                    className="primary"
                    onClick={() => (demo ? go('auth') : setCreate(true))}
                    disabled={!demo && !canEdit}
                  >
                    <Plus size={18} /> Create payroll
                  </button>
                )}
              </div>
              {demo && (
                <div className="demo-banner">
                  <div>
                    <b>You’re exploring sample data.</b> No AI processing or
                    payments have been performed.
                  </div>
                  <button className="text-link" onClick={() => go('auth')}>
                    Open your workspace{' '}
                    <ArrowRight size={15} className="inline" />
                  </button>
                </div>
              )}
              {notice && (
                <output className="notice info" aria-live="polite">
                  {notice}
                </output>
              )}
              {error && (
                <div className="notice error" role="alert">
                  {error}
                  <button
                    className="text-link"
                    style={{ marginLeft: 16 }}
                    onClick={() => void refresh()}
                  >
                    Retry connection
                  </button>
                </div>
              )}
              {view === 'overview' && (
                <Overview
                  data={data}
                  demo={demo}
                  onRun={onRun}
                  go={go}
                  create={() => (demo ? go('auth') : setCreate(true))}
                />
              )}
              {view === 'payroll' &&
                (selected ? (
                  <PayrollReview
                    key={selected.id}
                    run={selected}
                    contractors={data.contractors}
                    operations={data.operations}
                    config={config}
                    demo={demo}
                    refresh={refresh}
                    back={() => go('payroll')}
                    canEdit={canEdit}
                    canApprove={canApprove}
                  />
                ) : (
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>All payroll runs</h2>
                      <span className="muted">{data.runs.length} runs</span>
                    </div>
                    {data.runs.length ? (
                      <DataTable
                        headers={[
                          'Payroll',
                          'Period',
                          'Recipients',
                          'Total',
                          'Status',
                          '',
                        ]}
                      >
                        {data.runs.map((r) => (
                          <Row key={r.id}>
                            <Cell>
                              <button
                                className="text-link"
                                onClick={() => onRun(r.id)}
                              >
                                {r.name}
                              </button>
                              <small>
                                {r.demo ? 'Sample data' : 'Contractor payroll'}
                              </small>
                            </Cell>
                            <Cell>{r.period}</Cell>
                            <Cell>{r.plan?.payments.length || '—'}</Cell>
                            <Cell className="num">
                              {r.plan
                                ? display(r.plan.total, r.plan.decimals) +
                                  ' USDC'
                                : 'Not calculated'}
                            </Cell>
                            <Cell>
                              <Status value={r.status} />
                            </Cell>
                            <Cell>
                              <button
                                aria-label={`Review ${r.name}`}
                                onClick={() => onRun(r.id)}
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </Cell>
                          </Row>
                        ))}
                      </DataTable>
                    ) : (
                      <EmptyState
                        title="Your first payroll starts here"
                        description="Upload a spreadsheet or enter verified inputs to prepare your first payroll."
                        action={
                          <button
                            className="primary"
                            disabled={!canEdit}
                            onClick={() => setCreate(true)}
                          >
                            Create payroll
                          </button>
                        }
                      />
                    )}
                  </section>
                ))}
              {view === 'contractors' && (
                <Contractors
                  contractors={data.contractors}
                  runs={data.runs}
                  demo={demo}
                  refresh={refresh}
                  notify={notify}
                  canEdit={canEdit}
                />
              )}
              {view === 'treasury' && (
                <Treasury config={config} demo={demo} notify={notify} />
              )}
              {view === 'reconciliation' && (
                <Reconciliation runs={data.runs} onRun={onRun} />
              )}
              {view === 'insights' && <Insights data={data} />}
              {view === 'settings' && (
                <Settings
                  data={data}
                  config={config}
                  demo={demo}
                  refresh={refresh}
                  notify={notify}
                  theme={theme}
                  setTheme={setTheme}
                />
              )}
            </>
          )}
        </main>
      </div>
      <PayrollCreate
        open={create}
        onClose={() => setCreate(false)}
        contractors={data.contractors}
        onCreated={(id) => {
          void refresh();
          onRun(id);
        }}
      />
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="From source to payday"
        description="How payroll moves through Suiroll."
      >
        <div className="help-copy">
          <p>
            <b>1. Add contractors.</b> Verify each wallet and compensation with
            the contractor.
          </p>
          <p>
            <b>2. Create payroll.</b> Import CSV/XLSX or enter payments. Gonka
            maps source columns and explains notes.
          </p>
          <p>
            <b>3. Review inputs.</b> Confirm adjustments, taxes, fees, and
            currency conversion rates. Deterministic code calculates the payment
            plan and excludes duplicate invoices.
          </p>
          <p>
            <b>4. Check readiness.</b> Connect the configured treasury wallet.
            Suiroll checks the balance, authorization, registry, and simulated
            transfers.
          </p>
          <p>
            <b>5. Approve & Pay.</b> Your wallet signs one atomic batch. Suiroll
            verifies settlement and records reconciliation.
          </p>
          <p className="muted">
            Tax amounts and exchange rates must be supplied and verified by your
            payroll operator. Suiroll does not calculate jurisdiction-specific
            tax rules or fetch foreign exchange quotes.
          </p>
        </div>
      </Modal>
    </SidebarProvider>
  );
}
function Overview({
  data,
  demo,
  onRun,
  go,
  create,
}: {
  data: WorkspaceData;
  demo: boolean;
  onRun: (id: string) => void;
  go: (id: string) => void;
  create: () => void;
}) {
  const pending = data.runs.filter((r) =>
    ['PREPARED', 'READY', 'APPROVED'].includes(r.status),
  );
  const active = data.runs.find((r) => !['PAID', 'FAILED'].includes(r.status));
  const paid = data.runs.filter((r) => r.status === 'PAID');
  const metrics = [
    [
      'Current payroll',
      active?.plan ? display(active.plan.total, active.plan.decimals) : '—',
      active?.period || 'No payroll scheduled',
      Wallet,
    ],
    [
      'Active contractors',
      String(data.contractors.filter((c) => c.status === 'active').length),
      'People in your workspace',
      Users,
    ],
    [
      'Awaiting approval',
      String(pending.length),
      pending.length ? 'Ready for your review' : 'You’re all caught up',
      Layers,
    ],
    [
      'Reconciled payrolls',
      String(paid.length),
      'Verified against Sui',
      CheckCircle2,
    ],
  ] as const;
  return (
    <>
      <div className="metrics">
        {metrics.map(([label, value, sub, Icon]) => (
          <article className="metric" key={label}>
            <div>
              {label}
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>Your next payroll</h2>
              <button className="text-link" onClick={() => go('payroll')}>
                View all <ArrowUpRight className="inline" size={16} />
              </button>
            </div>
            {active ? (
              <>
                <div className="split-head">
                  <div>
                    <p className="eyebrow">{active.period}</p>
                    <h2 style={{ fontSize: 22 }}>{active.name}</h2>
                  </div>
                  <Status value={active.status} />
                </div>
                <p
                  className="muted"
                  style={{ fontSize: 14, margin: '14px 0 24px' }}
                >
                  {active.plan
                    ? `${active.plan.payments.length} recipients · amounts calculated and payment plan locked.`
                    : 'Review your source, resolve missing details, and prepare payment amounts.'}
                </p>
                <div
                  className="actions"
                  style={{
                    justifyContent: 'space-between',
                    paddingTop: 20,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span className="actions muted" style={{ fontSize: 14 }}>
                    <ShieldCheck size={17} /> Human approval required
                  </span>
                  <button className="primary" onClick={() => onRun(active.id)}>
                    Review payroll <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                title="Make your next payday effortless"
                description="Start with a source file. Suiroll helps you understand, check, and prepare payroll."
                action={
                  <button className="primary" onClick={create}>
                    Prepare payroll <ArrowRight size={16} />
                  </button>
                }
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Recent activity</h2>
              <Activity size={18} className="muted" />
            </div>
            {data.activity.length ? (
              data.activity.slice(0, 5).map((a) => (
                <div className="activity" key={a.id}>
                  <CheckCircle2 size={17} />
                  <div>
                    <p>{a.action}</p>
                    <small>{new Date(a.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: 14, padding: '15px 0' }}>
                {demo
                  ? 'Your live workspace activity will appear here after sign-in.'
                  : 'Your workspace is ready. Add contractors to get started.'}
              </p>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>A considered approval</h2>
              <ShieldCheck className="text-primary" size={20} />
            </div>
            <div className="steps">
              {[
                ['Understand your source', 'Focused AI analysis'],
                ['Calculate and check', 'Exact amounts, clear findings'],
                ['Review and approve', 'Your wallet, your authorization'],
                ['Settle and reconcile', 'Evidence verified on Sui'],
              ].map(([s, sub], i) => (
                <div key={s}>
                  <span>{i + 1}</span>
                  <div>
                    <b>{s}</b>
                    <small>{sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel" style={{ background: 'var(--accent)' }}>
            <h2 style={{ color: 'var(--accent-foreground)' }}>
              Payroll first.
              <br />
              Peace of mind, built in.
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--accent-foreground)',
                margin: '12px 0 20px',
              }}
            >
              Amounts are checked before approval. Payments are verified after
              settlement.
            </p>
            <button className="text-link" onClick={() => go('treasury')}>
              Check your treasury <ArrowRight className="inline" size={16} />
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
