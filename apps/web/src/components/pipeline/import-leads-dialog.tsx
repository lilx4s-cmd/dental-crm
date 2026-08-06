'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  LEAD_IMPORT_FIELDS,
  LEAD_IMPORT_MAX_ROWS,
  coerceLeadSource,
  detectDelimiter,
  guessColumnMapping,
  normalisePhone,
  parseCsv,
  parseImportedValue,
  splitFullName,
  type LeadImportField,
} from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImportLeads, type ImportedLeadRow, type ImportLeadsResult } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { formatMoney } from '@/lib/money';

/** Radix reserves '' for "no selection", so "not imported" needs a value of its own. */
const NO_COLUMN = '__none__';
const MY_LEADS = '__me__';
const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'CLINIC_MANAGER', 'SALES_CONSULTANT', 'RECEPTION'];
const PREVIEW_ROWS = 5;

type Mapping = Partial<Record<LeadImportField, number>>;

/**
 * Turns mapped spreadsheet rows into lead payloads.
 *
 * Kept separate from rendering so the preview and the request are built by the same function —
 * a preview produced a different way is a preview that can lie about what the import will do.
 */
function buildRows(rows: string[][], mapping: Mapping): ImportedLeadRow[] {
  const cell = (row: string[], field: LeadImportField): string => {
    const index = mapping[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  return rows.map((row) => {
    const rawFirst = cell(row, 'firstName');
    const rawLast = cell(row, 'lastName');
    // A file with one "Name" column still has to produce a surname, or every patient in the CRM
    // ends up mononymous and unsearchable by the name on their passport.
    const name = rawLast ? { firstName: rawFirst, lastName: rawLast } : splitFullName(rawFirst);

    const phone = cell(row, 'phone');
    const whatsapp = cell(row, 'whatsappNumber');
    const email = cell(row, 'email');
    const currency = cell(row, 'currency');

    return {
      firstName: name.firstName,
      lastName: name.lastName || undefined,
      phone: phone ? normalisePhone(phone) : undefined,
      whatsappNumber: whatsapp ? normalisePhone(whatsapp) : undefined,
      email: email || undefined,
      source: coerceLeadSource(cell(row, 'source')),
      estimatedValue: parseImportedValue(cell(row, 'estimatedValue')),
      currency: currency.length === 3 ? currency.toUpperCase() : undefined,
      notes: cell(row, 'notes') || undefined,
    };
  });
}

/** Why a built row would be rejected, checked here so the count shown is the count created. */
function rowProblem(row: ImportedLeadRow): string | null {
  if (!row.firstName) return 'No name';
  if (!row.phone && !row.email) return 'No phone or email';
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return 'Invalid email';
  return null;
}

export function ImportLeadsDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [assignedToId, setAssignedToId] = useState(MY_LEADS);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportLeadsResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: users } = useUsers();
  const importLeads = useImportLeads();

  const assignableUsers = (users ?? []).filter((u) => u.isActive && ASSIGNABLE_ROLES.includes(u.role));

  const built = useMemo(() => buildRows(rows, mapping), [rows, mapping]);
  const problems = useMemo(() => built.map(rowProblem), [built]);
  const validCount = problems.filter((p) => p === null).length;

  const reset = () => {
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setResult(null);
    // Read as text rather than streaming: these are contact lists of a few hundred rows, and the
    // mapping step needs the whole file in hand to show a preview anyway.
    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsed = parseCsv(text, delimiter);

    if (parsed.length < 2) {
      toast.error('That file has no rows under its header.');
      return;
    }

    const [head, ...body] = parsed;
    if (body.length > LEAD_IMPORT_MAX_ROWS) {
      toast.error(`That file has ${body.length} rows. The most one import can take is ${LEAD_IMPORT_MAX_ROWS}.`);
      return;
    }

    setFileName(file.name);
    setHeaders(head.map((h) => h.trim()));
    setRows(body);
    setMapping(guessColumnMapping(head));
    if (delimiter !== ',') {
      toast.info(`Read as ${delimiter === ';' ? 'semicolon' : delimiter === '\t' ? 'tab' : 'pipe'}-separated.`);
    }
  };

  const setField = (field: LeadImportField, value: string) =>
    setMapping((m) => {
      const next = { ...m };
      if (value === NO_COLUMN) delete next[field];
      else next[field] = Number(value);
      return next;
    });

  const handleImport = () => {
    const payload = built.filter((_, i) => problems[i] === null);
    if (payload.length === 0) {
      toast.error('No row in this file has both a name and a way to contact them.');
      return;
    }
    importLeads.mutate(
      {
        leads: payload,
        assignedToId: assignedToId === MY_LEADS ? undefined : assignedToId,
        skipDuplicates,
      },
      {
        onSuccess: (res) => {
          setResult(res);
          toast.success(`${res.created} lead${res.created === 1 ? '' : 's'} imported`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Import failed'),
      },
    );
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <span onClick={() => setOpen(true)}>{children}</span>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>
                <strong>{result.created}</strong> created
                {result.skipped > 0 && <> · <strong>{result.skipped}</strong> already on file</>}
                {result.errors.length > 0 && <> · <strong>{result.errors.length}</strong> rejected</>}
              </span>
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1.5 font-medium">Rows that could not be created:</p>
                <ul className="space-y-0.5">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Line {e.row} — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        ) : headers.length === 0 ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-muted/40">
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground">
                Comma-separated and UTF-8, as exported by Excel, Google Sheets or Bitrix. Semicolon
                and tab files are detected too.
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">What the file needs</p>
              <p>
                A header row, a column with the patient&apos;s name, and a phone or email — a lead
                nobody can contact is not imported. Everything else is optional and can be pointed at
                the right column on the next screen.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{fileName}</span> — {rows.length} row
              {rows.length === 1 ? '' : 's'}
            </p>

            {/* Column mapping */}
            <div>
              <Label className="text-xs text-muted-foreground">Match the columns</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {LEAD_IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </span>
                    <Select
                      value={mapping[field.key] === undefined ? NO_COLUMN : String(mapping[field.key])}
                      onValueChange={(v) => setField(field.key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_COLUMN}>Not imported</SelectItem>
                        {headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Preview — first {Math.min(PREVIEW_ROWS, built.length)} of {built.length}
              </Label>
              <div className="mt-1.5 overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                      <th className="px-2 py-1.5 text-left font-medium">Email</th>
                      <th className="px-2 py-1.5 text-left font-medium">Source</th>
                      <th className="px-2 py-1.5 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {built.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">
                          {problems[i] ? (
                            <span className="flex items-center gap-1 text-destructive-muted-foreground">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {problems[i]}
                            </span>
                          ) : (
                            `${row.firstName} ${row.lastName ?? ''}`.trim()
                          )}
                        </td>
                        <td className="px-2 py-1.5">{row.phone ?? '—'}</td>
                        <td className="px-2 py-1.5">{row.email ?? '—'}</td>
                        <td className="px-2 py-1.5">{row.source}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {row.estimatedValue == null ? '—' : formatMoney(row.estimatedValue, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validCount < built.length && (
                <p className="mt-1.5 text-xs text-warning-muted-foreground">
                  {built.length - validCount} of {built.length} rows will be left out — they have no
                  name, or no way to contact the person.
                </p>
              )}
            </div>

            {/* Options */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Assign every lead to</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MY_LEADS}>Me</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-2 pt-5 text-sm">
                <Checkbox
                  checked={skipDuplicates}
                  onCheckedChange={(c) => setSkipDuplicates(c === true)}
                />
                <span>
                  Skip anyone already on file
                  <span className="block text-xs text-muted-foreground">
                    Matched on phone or email, so re-importing a list adds only what is new.
                  </span>
                </span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Choose another file</Button>
              <Button onClick={handleImport} disabled={importLeads.isPending || validCount === 0}>
                <Upload className="mr-2 h-4 w-4" />
                {importLeads.isPending ? 'Importing…' : `Import ${validCount} lead${validCount === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
