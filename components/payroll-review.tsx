'use client';
import type { PreparedTransaction } from '@/lib/domain/api-types';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
  CircleCheck,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FileCheck,
  ExternalLink,
} from 'lucide-react';
import type {
  PayrollRun,
  Contractor,
  Operation,
  PublicConfig,
  InputRow,
} from '@/lib/domain/types';
import { action, short } from '@/lib/client';
import { display, decimal, difference } from '@/lib/domain/money';
import { Status, DataTable, Row, Cell, Busy, Modal } from './common';
import { RowFields } from './payroll-create';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
export function PayrollReview({
  run,
  contractors,
  operations,
  config,
  demo,
  refresh,
  back,
  canEdit,
  canApprove,
}: {
  run: PayrollRun;
  contractors: Contractor[];
  operations: Operation[];
  config: PublicConfig;
  demo: boolean;
  refresh: () => Promise<void>;
  back: () => void;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState<PreparedTransaction | null>(null);
  const [review, setReview] = useState(false);
  const [rows, setRows] = useState<InputRow[]>(run.rows);
  const [confirmed, setConfirmed] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const started = useRef(false);
  const work = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      setError('');
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy('');
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (run.status !== 'SUBMITTED' || demo) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await action('reconcile', { id: run.id });
        if (!stopped) await refresh();
      } catch {}
      if (!stopped) timer = setTimeout(poll, 15000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [run.id, run.status, demo, refresh]);
  async function pay() {
    if (!account || !run.plan) return;
    setBusy('Waiting for wallet approval…');
    setError('');
    try {
      const prepared = await action('approve', {
        id: run.id,
        wallet: account.address,
        planHash: run.plan.hash,
        confirmed: true,
      });
      const signed = await kit.signTransaction({
        transaction: Transaction.from(prepared.bytes),
      });
      if (signed.bytes !== prepared.bytes)
        throw new Error(
          'The wallet changed the prepared transaction. Payment was not submitted.',
        );
      setBusy('Submitting payment…');
      await action('submit', {
        id: run.id,
        bytes: signed.bytes,
        signature: signed.signature,
      });
      setApprovalOpen(false);
      await refresh();
      setBusy('Verifying settlement…');
      await action('reconcile', { id: run.id });
      await refresh();
    } catch (e) {
      setError(
        /reject|denied|cancel/i.test((e as Error).message)
          ? 'Wallet approval was cancelled. No payment was submitted by Suiroll.'
          : (e as Error).message,
      );
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    if (
      !started.current &&
      !demo &&
      canEdit &&
      run.status === 'DRAFT' &&
      !run.rows.length
    ) {
      started.current = true;
      void Promise.resolve().then(() =>
        work('Understanding source columns…', () =>
          action('processRun', { id: run.id }),
        ),
      );
    }
  }, [run.id, run.status, run.rows.length, canEdit, demo, work]);
  const phase =
    run.status === 'PAID'
      ? 100
      : run.status === 'SUBMITTED'
        ? 85
        : run.plan
          ? 65
          : run.rows.length
            ? 35
            : 10;
  const wrongWallet =
    !!account &&
    account.address.toLowerCase() !== config.treasury.toLowerCase();
  return (
    <div className="stack">
      <button className="text-link actions" onClick={back}>
        <ArrowLeft size={16} /> All payroll runs
      </button>
      <section className="panel">
        <div className="split-head">
          <div>
            <p className="eyebrow">{run.period} · Contractor payroll</p>
            <h1>{run.name}</h1>
          </div>
          <div className="actions">
            {run.source_id && !demo && (
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() =>
                  work('Opening original source…', async () => {
                    const result = await action('sourceDownload', {
                      id: run.id,
                    });
                    const response = await fetch(result.signedUrl);
                    if (!response.ok)
                      throw new Error('Source download failed.');
                    const url = URL.createObjectURL(await response.blob());
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'payroll-source';
                    link.click();
                    URL.revokeObjectURL(url);
                  })
                }
              >
                Download source
              </button>
            )}
            <Status value={run.status} />
          </div>
        </div>
        <Progress value={phase} className="h-1.5 my-6" />
        <div
          className="actions muted"
          style={{ justifyContent: 'space-between', fontSize: 13 }}
        >
          <span>01 Source</span>
          <span>02 Review</span>
          <span>03 Approval</span>
          <span>04 Settlement</span>
        </div>
      </section>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <output className="notice" aria-live="polite">
          <Busy text={busy} />
        </output>
      )}
      {run.status === 'PAID' && (
        <div className="notice info">
          <div className="actions">
            <CircleCheck size={22} />
            <h2>Payroll completed</h2>
          </div>
          <p>
            Every payment matches the approved plan. Settlement and registry
            evidence are verified.
          </p>
        </div>
      )}
      {demo && (
        <div className="notice warning">
          This is a read-only sample. Sign in, add verified contractor wallets,
          and import payroll to run a real testnet payment.
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>{run.plan ? 'Contractor payments' : 'Payroll inputs'}</h2>
            {run.rows.length > 0 && !run.plan && canEdit && (
              <button
                className="secondary"
                onClick={() => {
                  setRows(run.rows);
                  setReview(true);
                }}
              >
                Review inputs
              </button>
            )}
          </div>
          {run.plan ? (
            <DataTable
              headers={['Contractor', 'Invoices', 'Payment', 'Status']}
            >
              {run.plan.payments.map((p) => (
                <Row key={p.contractorId}>
                  <Cell>
                    {p.name}
                    <small>{short(p.wallet)}</small>
                  </Cell>
                  <Cell>{p.invoiceIds.join(', ')}</Cell>
                  <Cell className="num">
                    {display(p.amount, config.decimals)} USDC
                  </Cell>
                  <Cell>
                    <Status
                      value={run.status === 'PAID' ? 'PAID' : 'PREPARED'}
                    />
                  </Cell>
                </Row>
              ))}
            </DataTable>
          ) : run.rows.length ? (
            <DataTable
              headers={['Contractor', 'Invoice', 'Base pay', 'Source note']}
            >
              {run.rows.map((r, i) => (
                <Row key={i}>
                  <Cell>
                    {contractors.find((c) => c.id === r.contractorId)?.name ||
                      'Needs matching'}
                  </Cell>
                  <Cell>{r.invoiceId}</Cell>
                  <Cell>
                    {r.base} {r.currency}
                  </Cell>
                  <Cell>{r.note || '—'}</Cell>
                </Row>
              ))}
            </DataTable>
          ) : (
            <div className="empty">
              <FileCheck className="mx-auto text-primary" size={30} />
              <h2>Your source is ready</h2>
              <p>
                Gonka will map column names. You’ll review the original values
                before they become payment inputs.
              </p>
              <button
                className="primary"
                disabled={demo || !!busy || !canEdit}
                onClick={() =>
                  work('Understanding source columns…', () =>
                    action('processRun', { id: run.id }),
                  )
                }
              >
                Understand source <ArrowRight size={16} />
              </button>
            </div>
          )}
          {run.findings.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3>Checks & findings</h3>
              {run.findings.map((f, i) => (
                <div className="activity" key={i}>
                  <ShieldCheck size={17} />
                  <div>
                    <p>{f.message}</p>
                    <small>
                      {f.severity === 'BLOCK'
                        ? 'Action required'
                        : f.severity === 'WARN'
                          ? 'Review note'
                          : 'Checked'}
                      {f.row ? ` · Row ${f.row}` : ''}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="stack">
          <section className="panel">
            <p className="eyebrow">Payment summary</p>
            <div className="amount">
              {run.plan ? display(run.plan.total, config.decimals) : '—'}{' '}
              <span style={{ fontSize: 16, fontWeight: 500 }}>USDC</span>
            </div>
            <div className="detail-line">
              <span>Recipients</span>
              <b>{run.plan?.payments.length || '—'}</b>
            </div>
            <div className="detail-line">
              <span>Network</span>
              <b>Sui {config.network}</b>
            </div>
            <div className="detail-line">
              <span>Treasury</span>
              <b>{short(config.treasury)}</b>
            </div>
            {ready && (
              <div className="detail-line">
                <span>After payment</span>
                <b>
                  {display(
                    difference(ready.balance.stablecoin, run.plan!.total),
                    config.decimals,
                  )}{' '}
                  USDC
                </b>
              </div>
            )}
            {run.plan &&
              run.status !== 'PAID' &&
              run.status !== 'SUBMITTED' && (
                <>
                  <div className="check-list">
                    <p>
                      <CircleCheck size={16} /> Deterministic amounts
                    </p>
                    <p>
                      <CircleCheck size={16} /> Duplicate invoice protection
                    </p>
                    <p>
                      <CircleCheck size={16} /> Locked payment plan
                    </p>
                    {ready && (
                      <p>
                        <CircleCheck size={16} /> Treasury & simulation passed
                      </p>
                    )}
                  </div>
                  {wrongWallet && (
                    <div className="notice warning">
                      Switch to the authorized treasury wallet.
                    </div>
                  )}
                  {!account && (
                    <p
                      className="muted"
                      style={{ fontSize: 14, marginBottom: 16 }}
                    >
                      Connect your treasury wallet using the control above.
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={
                      demo ||
                      !!busy ||
                      !account ||
                      wrongWallet ||
                      !canApprove ||
                      run.status === 'FAILED'
                    }
                    onClick={() =>
                      ready
                        ? setApprovalOpen(true)
                        : work(
                            'Checking treasury and simulating payment…',
                            async () =>
                              setReady(
                                await action('preflight', {
                                  id: run.id,
                                  wallet: account!.address,
                                }),
                              ),
                          )
                    }
                  >
                    {ready ? 'Approve & Pay' : 'Check payment readiness'}
                  </button>
                </>
              )}
            {run.status === 'FAILED' && (
              <button
                className="primary"
                disabled={!!busy || !canApprove}
                onClick={() =>
                  work('Verifying failed settlement…', () =>
                    action('retryFailed', { id: run.id }),
                  )
                }
              >
                Retry payment checks
              </button>
            )}
            {run.status === 'SUBMITTED' && (
              <button
                className="primary"
                disabled={!!busy || !canApprove}
                onClick={() =>
                  work('Reconciling payment…', () =>
                    action('reconcile', { id: run.id }),
                  )
                }
              >
                <RefreshCw size={16} /> Check settlement
              </button>
            )}
            {run.digest && (
              <a
                className="text-link actions"
                style={{ marginTop: 18 }}
                href={`https://suiscan.xyz/${config.network}/tx/${run.digest}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Sui Explorer <ExternalLink size={15} />
              </a>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Payroll understanding</h2>
              <span className="badge neutral">Gonka</span>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              {run.summary ||
                'Focused AI operations explain your source. Financial values remain controlled by deterministic code.'}
            </p>
            {run.plan && !demo && canEdit && (
              <button
                className="text-link"
                style={{ marginTop: 15 }}
                disabled={!!busy}
                onClick={() =>
                  work('Writing payroll summary…', () =>
                    action('summarize', { id: run.id }),
                  )
                }
              >
                Generate summary
              </button>
            )}
            {run.rows.some((r) => r.note) && !demo && canEdit && (
              <button
                className="text-link"
                style={{ marginTop: 15 }}
                disabled={!!busy}
                onClick={() =>
                  work('Analyzing source notes…', async () => {
                    for (
                      let batch = 0;
                      batch <
                      Math.ceil(run.rows.filter((r) => r.note).length / 25);
                      batch++
                    )
                      await action('analyzeNotes', { id: run.id, batch });
                  })
                }
              >
                Analyze source notes
              </button>
            )}
            {operations
              .filter((o) => o.run_id === run.id)
              .map((o) => (
                <div className="activity" key={o.id}>
                  <div>
                    <p>{o.operation.replaceAll('_', ' ')}</p>
                    <Status value={o.status} />
                    {o.error && <small>{o.error}</small>}
                    {!!o.result && (
                      <details>
                        <summary>View AI evidence</summary>
                        <pre>{JSON.stringify(o.result, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
          </section>
        </div>
      </div>
      {run.plan && (
        <details className="panel">
          <summary>Advanced payment details</summary>
          <div className="mono">
            <p>Plan commitment: {run.plan.hash}</p>
            <p>Run commitment: {run.plan.runHash}</p>
            <p>Settlement currency: {run.plan.coinType}</p>
            <p>
              Exact total: {decimal(run.plan.total, run.plan.decimals)} USDC
            </p>
            <p>Registry: {config.registryId}</p>
            {run.digest && <p>Transaction: {run.digest}</p>}
          </div>
        </details>
      )}
      <Modal
        open={review}
        onClose={() => setReview(false)}
        title="Review financial inputs"
        description="Confirm every amount and contractor match. Notes do not change amounts automatically."
      >
        <div className="stack">
          {rows.map((r, i) => (
            <section className="panel" key={i}>
              <h3 style={{ marginBottom: 18 }}>Record {i + 1}</h3>
              <RowFields
                row={r}
                contractors={contractors}
                update={(row) =>
                  setRows(rows.map((x, j) => (i === j ? row : x)))
                }
              />
            </section>
          ))}
          <label
            htmlFor="payroll-input-confirmation"
            className="actions"
            style={{ fontSize: 14 }}
          >
            <Checkbox
              id="payroll-input-confirmation"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            I verified contractor matches, adjustments, taxes, fees, exchange
            rates, and all zero values.
          </label>
          <button
            className="primary"
            disabled={!confirmed || !!busy}
            onClick={() =>
              work('Calculating and validating payroll…', async () => {
                await action('finalizeRun', {
                  id: run.id,
                  rows,
                  confirmed: true,
                });
                setReview(false);
              })
            }
          >
            Confirm inputs & calculate
          </button>
        </div>
      </Modal>
      <Modal
        open={approvalOpen}
        onClose={() => !busy && setApprovalOpen(false)}
        title="Approve this payroll"
        description="Your wallet will authorize one atomic payment batch."
      >
        <div className="amount">
          {run.plan && display(run.plan.total, config.decimals)} USDC
        </div>
        <div className="detail-line">
          <span>Payroll</span>
          <b>{run.name}</b>
        </div>
        <div className="detail-line">
          <span>Recipients</span>
          <b>{run.plan?.payments.length}</b>
        </div>
        <div className="detail-line">
          <span>Network</span>
          <b>Sui {config.network}</b>
        </div>
        <div className="detail-line">
          <span>Wallet</span>
          <b>{short(account?.address || '')}</b>
        </div>
        <div className="detail-line">
          <span>Maximum fee budget</span>
          <b>0.03 SUI</b>
        </div>
        <p className="muted" style={{ fontSize: 14, marginTop: 20 }}>
          All payment checks run again before the wallet opens. The exact
          approved transaction is submitted and reconciled.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button
            className="secondary"
            disabled={!!busy}
            onClick={() => setApprovalOpen(false)}
          >
            Cancel
          </button>
          <button className="primary" disabled={!!busy} onClick={pay}>
            {busy ? (
              <Busy text={busy} />
            ) : (
              <>
                <ShieldCheck size={17} /> Approve & Pay
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
