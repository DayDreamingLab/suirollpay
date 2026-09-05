'use client';
import type { ReactNode } from 'react';
import { Layers, LoaderCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
export function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label} className="w-full h-11">
        <SelectValue>
          {options.find((o) => o.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl p-7">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="dialog-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
export function Status({ value }: { value: string }) {
  const text: Record<string, string> = {
    DRAFT: 'Source received',
    PROCESSING: 'Processing',
    ACTION_REQUIRED: 'Action required',
    PREPARED: 'Ready for checks',
    READY: 'Ready for approval',
    APPROVED: 'Approved',
    SUBMITTED: 'Payment pending',
    PAID: 'Paid & reconciled',
    FAILED: 'Needs attention',
    COMPLETED: 'Completed',
    RUNNING: 'Processing',
    RETRYING: 'Retrying',
    SKIPPED: 'Skipped',
    PENDING: 'Pending',
  };
  return (
    <span
      className={
        'badge ' +
        (['ACTION_REQUIRED', 'PREPARED', 'SUBMITTED', 'RETRYING'].includes(
          value,
        )
          ? 'warning'
          : value === 'FAILED'
            ? 'error'
            : ['DRAFT', 'PENDING'].includes(value)
              ? 'neutral'
              : '')
      }
    >
      {text[value] || value}
    </span>
  );
}
export function Busy({ text = 'Working…' }: { text?: string }) {
  return (
    <output className="actions" aria-live="polite">
      <LoaderCircle className="spinner" size={17} />
      {text}
    </output>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="empty">
      <EmptyHeader>
        <Layers className="mx-auto text-primary" size={28} />
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}
export { TableRow as Row, TableCell as Cell };
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
