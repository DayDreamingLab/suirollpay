'use client';
import { useState } from 'react';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import { Upload, Plus, Trash2 } from 'lucide-react';
import type { Contractor, InputRow } from '@/lib/domain/types';
import { action, download } from '@/lib/client';
import { blankRow } from '@/lib/demo';
import { Modal, Field, Choice, Busy } from './common';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
export function PayrollCreate({
  open,
  onClose,
  contractors,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  contractors: Contractor[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [mode, setMode] = useState('import');
  const [source, setSource] = useState<{
    headers: string[];
    records: Record<string, string>[];
  } | null>(null);
  const [filename, setFilename] = useState('');
  const [original, setOriginal] = useState<{
    base64: string;
    type: string;
  } | null>(null);
  const [scenario, setScenario] = useState(false);
  const [rows, setRows] = useState<InputRow[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function read(file: File | undefined) {
    if (!file) return;
    setError('');
    setSource(null);
    setOriginal(null);
    setFilename('');
    try {
      if (file.size > 2_000_000)
        throw new Error('Use a source smaller than 2 MB.');
      let records: Record<string, string>[];
      if (/\.xlsx$/i.test(file.name)) {
        const cells = await readSheet(file, { parseNumber: (value) => value });
        const headers = cells[0].map(String);
        records = cells
          .slice(1)
          .map((row) =>
            Object.fromEntries(
              headers.map((h, i) => [h, String(row[i] ?? '')]),
            ),
          );
      } else if (/\.csv$/i.test(file.name)) {
        const parsed = Papa.parse<Record<string, string>>(await file.text(), {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length)
          throw new Error(
            'The CSV has inconsistent columns. Fix the source and import again.',
          );
        records = parsed.data;
      } else throw new Error('Choose a CSV or XLSX file.');
      if (!records.length || records.length > 250)
        throw new Error('Import between 1 and 250 rows per run.');
      setSource({ headers: Object.keys(records[0]), records });
      setFilename(file.name);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            (typeof reader.result === 'string' ? reader.result : '').split(
              ',',
            )[1],
          );
        reader.onerror = () =>
          reject(new Error('Unable to read the source file.'));
        reader.readAsDataURL(file);
      });
      setOriginal({
        base64,
        type: /\.xlsx$/i.test(file.name)
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv',
      });
      setScenario(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await action('createRun', {
        name: name || `${period} contractor payroll`,
        period,
        ...(mode === 'import'
          ? { source, filename, original }
          : { rows, demo: scenario }),
      });
      onClose();
      onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create payroll"
      description="Start with a spreadsheet or enter verified payment inputs."
    >
      <form className="fields" onSubmit={create}>
        <div className="two-col">
          <Field label="Payroll name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="September contractor payroll"
            />
          </Field>
          <Field label="Payroll month">
            <input
              required
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
        </div>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="import">Import source</TabsTrigger>
            <TabsTrigger value="manual">Enter payments</TabsTrigger>
          </TabsList>
          <TabsContent value="import">
            <div
              className="panel"
              style={{ marginTop: 18, textAlign: 'center' }}
            >
              <Upload className="mx-auto text-primary" size={28} />
              <h2 style={{ margin: '12px 0' }}>Bring your payroll source</h2>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                CSV or XLSX · Up to 250 records · 2 MB maximum
              </p>
              <input
                aria-label="Upload payroll spreadsheet"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => read(e.target.files?.[0])}
              />
              {source && (
                <p className="badge" style={{ marginTop: 16 }}>
                  {filename} · {source.records.length} records
                </p>
              )}
            </div>
            <button
              className="text-link"
              type="button"
              style={{ marginTop: 12 }}
              onClick={() =>
                download(
                  'suiroll-payroll-template.csv',
                  'Contractor,Invoice,Base,Bonus,Reimbursement,Deduction,Tax,Fee,Currency,FX Rate,Note\n"contractor@example.com","INV-001","1.00","0","0","0","0","0","USDC","1",""\n',
                )
              }
            >
              Download CSV template
            </button>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              Gonka maps column names. Your original financial values are
              preserved for review.
            </p>
          </TabsContent>
          <TabsContent value="manual">
            <div className="stack" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="secondary"
                disabled={
                  !contractors.filter((c) => c.status === 'active').length
                }
                onClick={() => {
                  const active = contractors
                    .filter((c) => c.status === 'active')
                    .slice(0, 3);
                  const ref = 'DEMO-' + Date.now();
                  const sample = active.map((c, i) => ({
                    ...blankRow(c.id),
                    invoiceId: ref + '-' + i,
                    base: '0.1',
                    bonus: i === 0 ? '0.02' : i === 2 ? '0.2' : '0',
                    note:
                      i === 0
                        ? 'Documented test bonus of 0.02 USDC'
                        : i === 2
                          ? 'Documented test bonus of 0.20 USDC'
                          : '',
                  }));
                  if (sample.length > 1) sample.push({ ...sample[1] });
                  setRows(sample);
                  setScenario(true);
                  setName('Testnet demo payroll');
                }}
              >
                Load small testnet scenario
              </button>
              {scenario && (
                <div className="notice info">
                  Uses your verified contractors, small amounts, a bonus, and a
                  duplicate invoice. Review all inputs before paying.
                </div>
              )}
              {rows.map((r, i) => (
                <section className="panel" key={i}>
                  <div className="split-head">
                    <h3>Payment {i + 1}</h3>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove payment ${i + 1}`}
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <RowFields
                    row={r}
                    contractors={contractors}
                    update={(row) =>
                      setRows(rows.map((v, j) => (j === i ? row : v)))
                    }
                  />
                </section>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() => setRows([...rows, blankRow()])}
              >
                <Plus size={16} /> Add payment
              </button>
            </div>
          </TabsContent>
        </Tabs>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <button
          className="primary"
          disabled={busy || (mode === 'import' && !source)}
        >
          {busy ? <Busy /> : 'Create payroll'}
        </button>
      </form>
    </Modal>
  );
}
export function RowFields({
  row,
  contractors,
  update,
}: {
  row: InputRow;
  contractors: Contractor[];
  update: (r: InputRow) => void;
}) {
  const field = (k: keyof InputRow, v: string) => update({ ...row, [k]: v });
  return (
    <div className="fields">
      <Field label="Contractor">
        <Choice
          label="Match contractor"
          value={row.contractorId}
          onChange={(v) => field('contractorId', v)}
          options={contractors
            .filter((c) => c.status === 'active')
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </Field>
      <div className="two-col">
        <Field label="Invoice reference">
          <input
            required
            value={row.invoiceId}
            onChange={(e) => field('invoiceId', e.target.value)}
          />
        </Field>
        <Field label="Base pay">
          <input
            required
            inputMode="decimal"
            value={row.base}
            onChange={(e) => field('base', e.target.value)}
          />
        </Field>
      </div>
      <div className="two-col">
        {(['bonus', 'reimbursement', 'deduction', 'tax', 'fee'] as const).map(
          (k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input
                required
                inputMode="decimal"
                value={row[k]}
                onChange={(e) => field(k, e.target.value)}
              />
            </Field>
          ),
        )}
      </div>
      <div className="two-col">
        <Field label="Source currency">
          <input
            required
            value={row.currency}
            onChange={(e) => field('currency', e.target.value.toUpperCase())}
          />
        </Field>
        <Field
          label="Verified rate to USDC"
          hint="1 for USDC. You supply and verify any conversion rate."
        >
          <input
            required
            inputMode="decimal"
            value={row.fxRate}
            onChange={(e) => field('fxRate', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Source note">
        <textarea
          value={row.note}
          onChange={(e) => field('note', e.target.value)}
        />
      </Field>
    </div>
  );
}
