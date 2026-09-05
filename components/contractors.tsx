'use client';
import { useState } from 'react';
import { Plus, Copy, ArrowLeft } from 'lucide-react';
import type { Contractor, PayrollRun } from '@/lib/domain/types';
import { action, short } from '@/lib/client';
import { display } from '@/lib/domain/money';
import {
  Modal,
  Field,
  Choice,
  DataTable,
  Row,
  Cell,
  Status,
  EmptyState,
  Busy,
} from './common';
export function Contractors({
  contractors,
  runs,
  demo,
  refresh,
  notify,
  canEdit,
}: {
  contractors: Contractor[];
  runs: PayrollRun[];
  demo: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contractor | null>(null);
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const {
        id,
        organization_id: _organizationId,
        created_at: _createdAt,
        ...contractor
      } = editing;
      await action('saveContractor', { id, contractor });
      setEditing(null);
      await refresh();
      notify('Contractor saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const form = (key: keyof Contractor, value: string) =>
    setEditing({ ...editing, [key]: value });
  if (selected && !editing) {
    const history = runs.filter((r) =>
      r.plan?.payments.some((p) => p.contractorId === selected.id),
    );
    return (
      <div className="stack">
        <button className="text-link actions" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} /> Contractor directory
        </button>
        <section className="panel">
          <div className="split-head">
            <div>
              <span className="avatar">{selected.name.slice(0, 1)}</span>
              <h1 style={{ marginTop: 12 }}>{selected.name}</h1>
              <p className="muted">
                {selected.department} · {selected.email}
              </p>
            </div>
            {canEdit && (
              <button
                className="secondary"
                onClick={() => setEditing({ ...selected })}
              >
                Edit contractor
              </button>
            )}
          </div>
          <div className="two-col">
            <div>
              <small>Base compensation</small>
              <h2>{selected.rate} USDC</h2>
            </div>
            <div>
              <small>Payment wallet</small>
              <p className="actions">
                {short(selected.wallet)}
                {selected.wallet && (
                  <button
                    aria-label="Copy wallet address"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(selected.wallet)
                        .then(() => notify('Address copied.'))
                    }
                  >
                    <Copy size={15} />
                  </button>
                )}
              </p>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Payment history</h2>
          {history.length ? (
            <DataTable headers={['Payroll', 'Period', 'Amount', 'Status']}>
              {history.map((r) => (
                <Row key={r.id}>
                  <Cell>{r.name}</Cell>
                  <Cell>{r.period}</Cell>
                  <Cell>
                    {display(
                      r.plan!.payments.find(
                        (p) => p.contractorId === selected.id,
                      )!.amount,
                      r.plan!.decimals,
                    )}{' '}
                    USDC
                  </Cell>
                  <Cell>
                    <Status value={r.status} />
                  </Cell>
                </Row>
              ))}
            </DataTable>
          ) : (
            <EmptyState
              title="No payments yet"
              description="Completed and upcoming payments will appear here."
            />
          )}
        </section>
      </div>
    );
  }
  return (
    <>
      <div className="split-head">
        <input
          className="search"
          style={{ maxWidth: 320 }}
          aria-label="Search contractors"
          placeholder="Search name, email, or department"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="primary"
          disabled={!canEdit}
          onClick={() =>
            setEditing({
              name: '',
              email: '',
              department: '',
              wallet: '',
              rate: '',
              status: 'active',
            })
          }
        >
          <Plus size={16} /> Add contractor
        </button>
      </div>
      <section className="panel">
        {contractors.length ? (
          <DataTable
            headers={[
              'Contractor',
              'Department',
              'Base pay',
              'Wallet',
              'Status',
            ]}
          >
            {contractors
              .filter((c) =>
                `${c.name} ${c.email} ${c.department}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <Row key={c.id}>
                  <Cell>
                    <button
                      className="text-link"
                      onClick={() => setSelected(c)}
                    >
                      {c.name}
                    </button>
                    <small>{c.email}</small>
                  </Cell>
                  <Cell>{c.department || '—'}</Cell>
                  <Cell>{c.rate} USDC</Cell>
                  <Cell>
                    {c.wallet ? (
                      short(c.wallet)
                    ) : (
                      <span className="badge warning">Wallet needed</span>
                    )}
                  </Cell>
                  <Cell>
                    <span className="badge">{c.status}</span>
                  </Cell>
                </Row>
              ))}
          </DataTable>
        ) : (
          <EmptyState
            title="People behind your payroll"
            description="Add your first contractor, compensation, and verified Sui wallet."
          />
        )}
      </section>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit contractor' : 'Add contractor'}
        description="Verify the wallet directly with the contractor. It is used for every payment."
      >
        <form className="fields" onSubmit={save}>
          <div className="two-col">
            <Field label="Full name">
              <input
                required
                value={editing?.name || ''}
                onChange={(e) => form('name', e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={editing?.email || ''}
                onChange={(e) => form('email', e.target.value)}
              />
            </Field>
          </div>
          <div className="two-col">
            <Field label="Department">
              <input
                value={editing?.department || ''}
                onChange={(e) => form('department', e.target.value)}
              />
            </Field>
            <Field label="Base compensation (USDC)">
              <input
                required
                inputMode="decimal"
                value={editing?.rate || ''}
                onChange={(e) => form('rate', e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Sui wallet address"
            hint="Use the full 0x address, followed by 64 hexadecimal characters."
          >
            <input
              required
              pattern="0x[0-9a-fA-F]{64}"
              value={editing?.wallet || ''}
              onChange={(e) => form('wallet', e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Choice
              label="Contractor status"
              value={editing?.status || 'active'}
              onChange={(v) => form('status', v)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </Field>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy || demo}>
            {busy ? <Busy /> : 'Save contractor'}
          </button>
        </form>
      </Modal>
    </>
  );
}
