'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePatients } from '@/hooks/use-patients';
interface Catalog {
  id: string;
  key: string;
  version: number;
  active: boolean;
  details: {
    name: string;
    category: string;
    unit: string;
    currency: string;
    sellingPrice: string | null;
    cost: string | null;
    provider: string;
    brand: string;
    material: string;
  };
}
const categories = [
  'IMPLANT',
  'CROWN',
  'VENEER',
  'ABUTMENT',
  'EXTRACTION',
  'GRAFT',
  'SINUS',
  'LAB',
  'TEMPORARY',
  'SCAN',
  'MEDICATION',
  'HOTEL',
  'TRANSFER',
  'OTHER',
  'FEE',
];
const monthNow = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-sm">
      {label}
      <select
        className="block min-h-11 w-full rounded border p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
export default function OperationsFinancePage() {
  const { accessToken, user } = useAuth(),
    [month, setMonth] = useState(monthNow),
    [result, setResult] = useState(''),
    [tab, setTab] = useState('Overview');
  const get = <T,>(path: string) =>
    apiRequest<T>('/api/operations-finance/' + path, {}, accessToken ?? undefined);
  const send = async (path: string, body: unknown) => {
    try {
      const r = await apiRequest(
        '/api/operations-finance/' + path,
        {
          method: /^(commissions|expenses)\/[^/]+$/.test(path) ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
        accessToken ?? undefined,
      );
      setResult('Saved');
      return r;
    } catch (e) {
      setResult((e as Error).message);
      throw e;
    }
  };
  const allowed = user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER';
  const catalog = useQuery<Catalog[]>({
    queryKey: ['cost-catalog'],
    queryFn: () => get('catalog'),
    enabled: allowed && !!accessToken,
  });
  if (!allowed)
    return <p role="alert">Clinic management access is required for internal finances.</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-2xl font-semibold">Travel costs and compensation</h1>
      <p>
        Patient charges, internal costs, collected payments, commission and business expenses remain
        separate. Missing costs are shown as missing.
      </p>
      <div className="flex flex-wrap gap-2">
        {['Overview', 'Catalog', 'Case costs', 'Compensation', 'Google Calendar'].map((t) => (
          <Button key={t} variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      <Field label="Reporting month" type="month" value={month} onChange={setMonth} />
      {result && <p role="status">{result}</p>}
      {catalog.isError && <p role="alert">{catalog.error.message}</p>}
      {tab === 'Catalog' && (
        <CatalogForm
          catalog={catalog.data ?? []}
          save={async (b) => {
            await send('catalog', b);
            void catalog.refetch();
          }}
        />
      )}
      {tab === 'Case costs' && (
        <CostsForm catalog={catalog.data ?? []} save={(b) => send('costs', b)} get={get} />
      )}{' '}
      {tab === 'Compensation' && <Compensation month={month} get={get} save={send} />}{' '}
      {tab === 'Google Calendar' && <GoogleSettings get={get} save={send} />}{' '}
      {tab === 'Overview' && <Overview month={month} get={get} save={send} />}
    </div>
  );
}
function CatalogForm({
  catalog,
  save,
}: {
  catalog: Catalog[];
  save: (b: unknown) => Promise<unknown>;
}) {
  const [v, setV] = useState({
    key: '',
    name: '',
    category: 'IMPLANT',
    unit: '',
    currency: '',
    sellingPrice: '',
    cost: '',
    provider: '',
    brand: '',
    material: '',
    effectiveAt: new Date().toISOString().slice(0, 16),
    active: true,
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState('');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Versioned price and cost catalog</h2>
      <p>
        Choose an existing item to create a new version. Earlier case snapshots remain unchanged.
        Blank cost means unknown.
      </p>
      <select
        aria-label="Catalog item to revise"
        className="min-h-11 w-full rounded border p-2"
        value=""
        onChange={(e) => {
          const c = catalog.find((c) => c.id === e.target.value);
          if (c)
            setV({
              ...v,
              ...c.details,
              key: c.key,
              sellingPrice: c.details.sellingPrice ?? '',
              cost: c.details.cost ?? '',
              active: c.active,
              reason: '',
            });
        }}
      >
        <option value="">New item / select item to revise</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {c.details.name} · v{c.version} · {c.details.currency}
          </option>
        ))}
      </select>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            'key',
            'name',
            'unit',
            'currency',
            'sellingPrice',
            'cost',
            'provider',
            'brand',
            'material',
            'effectiveAt',
            'reason',
          ] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              k === 'sellingPrice'
                ? 'Patient unit selling price'
                : k === 'cost'
                  ? 'Internal unit cost'
                  : k === 'unit'
                    ? 'Unit (tooth, implant, night, route…)'
                    : k
            }
            type={k === 'effectiveAt' ? 'datetime-local' : 'text'}
            value={v[k]}
            onChange={(value) => setV({ ...v, [k]: value })}
          />
        ))}
        <Choice
          label="Category"
          value={v.category}
          options={categories}
          onChange={(category) => setV({ ...v, category })}
        />
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
          />
          Active
        </label>
      </div>
      <Button
        disabled={busy}
        onClick={() => {
          const effectiveAt = new Date(v.effectiveAt);
          if (!Number.isFinite(effectiveAt.getTime())) {
            setValidation('Choose a valid effective date and time.');
            return;
          }
          setValidation('');
          setBusy(true);
          void save({
            ...v,
            currency: v.currency.toUpperCase(),
            sellingPrice: v.sellingPrice || null,
            cost: v.cost || null,
            effectiveAt: effectiveAt.toISOString(),
          })
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
      >
        Save new catalog version
      </Button>
      {validation && <p role="alert">{validation}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.slice(0, 40).map((c) => (
          <article className="rounded border p-3" key={c.id}>
            <strong>
              {c.details.name} · v{c.version}
            </strong>
            <p>
              {c.details.category} · {c.details.unit} · {c.details.currency}
            </p>
            <p>
              Patient price {c.details.sellingPrice ?? 'Missing'} · Internal cost{' '}
              {c.details.cost ?? 'Missing'} · {c.active ? 'Active' : 'Inactive'}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
interface CostLine {
  catalogId: string;
  quantity: string;
  included: boolean;
  actualCost: string;
  exceptionPrice: string;
  exceptionCost: string;
  exceptionReason: string;
}
function CostsForm({
  catalog,
  save,
  get,
}: {
  catalog: Catalog[];
  save: (b: unknown) => Promise<unknown>;
  get: <T>(p: string) => Promise<T>;
}) {
  const [reportMonth, setReportMonth] = useState(monthNow),
    [search, setSearch] = useState(''),
    [patientId, setPatient] = useState(''),
    [leadId, setLead] = useState(''),
    [visit, setVisit] = useState('1'),
    [mode, setMode] = useState('ITEMIZED'),
    [currency, setCurrency] = useState(''),
    [packagePrice, setPackage] = useState(''),
    [commission, setCommission] = useState(''),
    [reason, setReason] = useState(''),
    [state, setState] = useState('ESTIMATE'),
    [lines, setLines] = useState<CostLine[]>([]),
    [rates, setRates] = useState<{ from: string; to: string; rate: string; date: string }[]>([]),
    [totals, setTotals] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const patients = usePatients({ search, limit: 20 });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">First / second visit cost snapshot</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Cost recognition month"
          type="month"
          value={reportMonth}
          onChange={setReportMonth}
        />
        <Field label="Find existing patient" value={search} onChange={setSearch} />
        <label className="block text-sm">
          Patient and linked deal
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={patientId}
            onChange={(e) => {
              const patient = patients.data?.data.find((p) => p.id === e.target.value);
              setPatient(patient?.id ?? '');
              setLead(patient?.convertedFromLeadId ?? '');
            }}
          >
            <option value="">Select patient</option>
            {patients.data?.data
              .filter((p) => p.convertedFromLeadId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
          </select>
        </label>
        <Choice label="Visit" value={visit} options={['1', '2']} onChange={setVisit} />
        <Choice label="Pricing" value={mode} options={['ITEMIZED', 'PACKAGE']} onChange={setMode} />
        <Choice
          label="Snapshot"
          value={state}
          options={['ESTIMATE', 'CONFIRMED']}
          onChange={setState}
        />
        <Field label="Reporting currency" value={currency} onChange={setCurrency} />
        {mode === 'PACKAGE' && (
          <Field label="Agreed package price" value={packagePrice} onChange={setPackage} />
        )}
        <Field
          label="Defined commission amount (blank until policy calculated)"
          value={commission}
          onChange={setCommission}
        />
        <Field label="Change / exception reason" value={reason} onChange={setReason} />
      </div>
      <p>
        Included hotel / transfer lines carry internal costs but add no extra patient charge.
        Package mode counts the package price once.
      </p>
      {lines.map((line, i) => (
        <article className="grid gap-3 rounded border p-3 sm:grid-cols-3" key={i}>
          <label>
            Catalog item
            <select
              className="block min-h-11 w-full rounded border p-2"
              value={line.catalogId}
              onChange={(e) =>
                setLines(lines.map((l, n) => (n === i ? { ...l, catalogId: e.target.value } : l)))
              }
            >
              <option value="">Choose item</option>
              {catalog
                .filter((c) => c.active)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.details.name} · v{c.version} · {c.details.currency}
                  </option>
                ))}
            </select>
          </label>
          {(
            [
              'quantity',
              'actualCost',
              'exceptionPrice',
              'exceptionCost',
              'exceptionReason',
            ] as const
          ).map((k) => (
            <Field
              key={k}
              label={k === 'actualCost' ? 'Actual unit cost (blank if unknown)' : k}
              value={line[k]}
              onChange={(value) =>
                setLines(lines.map((l, n) => (n === i ? { ...l, [k]: value } : l)))
              }
            />
          ))}
          <label className="flex min-h-11 gap-2 items-center">
            <input
              type="checkbox"
              checked={line.included}
              onChange={(e) =>
                setLines(lines.map((l, n) => (n === i ? { ...l, included: e.target.checked } : l)))
              }
            />
            Included in package / no extra charge
          </label>
          <Button variant="outline" onClick={() => setLines(lines.filter((_, n) => n !== i))}>
            Remove item
          </Button>
        </article>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          setLines([
            ...lines,
            {
              catalogId: '',
              quantity: '1',
              included: false,
              actualCost: '',
              exceptionPrice: '',
              exceptionCost: '',
              exceptionReason: '',
            },
          ])
        }
      >
        Add treatment / hotel / transfer item
      </Button>
      <h3 className="font-semibold">Recorded exchange rates</h3>
      {rates.map((r, i) => (
        <div className="grid gap-3 rounded border p-3 sm:grid-cols-4" key={i}>
          {(['from', 'to', 'rate', 'date'] as const).map((k) => (
            <Field
              key={k}
              label={k}
              type={k === 'date' ? 'date' : 'text'}
              value={r[k]}
              onChange={(value) =>
                setRates(rates.map((row, n) => (n === i ? { ...row, [k]: value } : row)))
              }
            />
          ))}
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          setRates([
            ...rates,
            { from: '', to: currency, rate: '', date: new Date().toISOString().slice(0, 10) },
          ])
        }
      >
        Add exchange rate
      </Button>
      <div className="flex gap-3">
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save({
              patientId,
              leadId,
              reportMonth,
              visit: Number(visit),
              mode,
              state,
              currency: currency.toUpperCase(),
              packagePrice: packagePrice || null,
              commission: commission || null,
              reason,
              exchangeRates: rates,
              lines: lines.map((l) => ({
                catalogId: l.catalogId,
                quantity: l.quantity,
                included: l.included,
                actualCost: l.actualCost || null,
                exception: l.exceptionReason
                  ? {
                      sellingPrice: l.exceptionPrice || null,
                      cost: l.exceptionCost || null,
                      reason: l.exceptionReason,
                    }
                  : null,
              })),
            })
              .then((r) =>
                setTotals((r as { details: { totals: Record<string, unknown> } }).details.totals),
              )
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          Calculate and save snapshot
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void get<Record<string, unknown>>('summary/' + leadId).then((rows) => setTotals(rows))
          }
        >
          Load visits and full-case totals
        </Button>
      </div>
      {totals && <Summary values={totals} />}
    </section>
  );
}
function Summary({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="grid gap-3 rounded border p-4 sm:grid-cols-2">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt className="text-sm text-muted-foreground">{key}</dt>
          <dd className="break-words">
            {value === null
              ? 'Missing / cannot calculate'
              : Array.isArray(value)
                ? value.map((item, index) =>
                    item && typeof item === 'object' ? (
                      <Summary key={index} values={item as Record<string, unknown>} />
                    ) : (
                      <p key={index}>{String(item)}</p>
                    ),
                  )
                : typeof value === 'object'
                  ? Object.entries(value as Record<string, unknown>)
                      .map(
                        ([k, v]) =>
                          `${k}: ${
                            typeof v === 'object'
                              ? Object.entries(v as object)
                                  .map(([a, b]) => `${a} ${b ?? 'Missing'}`)
                                  .join(', ')
                              : String(v)
                          }`,
                      )
                      .join('; ')
                  : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Compensation({
  month,
  get,
  save,
}: {
  month: string;
  get: <T>(p: string) => Promise<T>;
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const data = useQuery<{
    staff: { id: string; firstName: string; lastName: string }[];
    rules: { id: string; staffId: string; version: number; details: Record<string, unknown> }[];
  }>({ queryKey: ['compensation'], queryFn: () => get('compensation') });
  const [v, setV] = useState({
      staffId: '',
      currency: '',
      salary: '',
      salaryAccrual: '',
      fixed: '',
      percentage: '',
      effectiveAt: new Date().toISOString().slice(0, 16),
      trigger: '',
      basis: '',
      attribution: '',
      cancellation: '',
      refund: '',
      scope: '',
      reason: '',
    }),
    [excluded, setExcluded] = useState<string[]>([]),
    [tiers, setTiers] = useState<{ threshold: string; percentage: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState('');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Administrator compensation policies</h2>
      {data.isError && <p role="alert">{data.error.message}</p>}
      {validation && <p role="alert">{validation}</p>}
      <p>
        Select every eligibility and attribution policy explicitly. No commission is earned until an
        effective rule and supported calculation basis exist.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Employee
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={v.staffId}
            onChange={(e) => setV({ ...v, staffId: e.target.value })}
          >
            <option value="">Select employee</option>
            <option value="ALL_ACTIVE">Apply default to all active employees</option>
            {data.data?.staff.map((s) => (
              <option value={s.id} key={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        {(['currency', 'salary', 'fixed', 'percentage', 'effectiveAt', 'reason'] as const).map(
          (k) => (
            <Field
              key={k}
              label={
                k === 'salary'
                  ? 'Monthly salary'
                  : k === 'fixed'
                    ? 'Fixed commission per eligible case / visit'
                    : k
              }
              type={k === 'effectiveAt' ? 'datetime-local' : 'text'}
              value={v[k]}
              onChange={(value) => setV({ ...v, [k]: value })}
            />
          ),
        )}
        {Object.entries({
          salaryAccrual: ['MONTH_START', 'MONTH_END'],
          trigger: ['BOOKING', 'DEPOSIT', 'ARRIVAL', 'COLLECTED_PAYMENT', 'COMPLETED_TREATMENT'],
          basis: ['AGREED_REVENUE', 'COLLECTED_REVENUE', 'DEFINED_PROFIT'],
          attribution: ['AT_TRIGGER', 'ORIGINAL_SALESPERSON', 'MANUAL_SHARED'],
          cancellation: ['REVERSE', 'KEEP_EARNED', 'MANUAL_REVIEW'],
          refund: ['PROPORTIONAL', 'REVERSE', 'MANUAL_REVIEW'],
          scope: ['PER_CASE', 'PER_VISIT'],
        }).map(([k, options]) => (
          <Choice
            key={k}
            label={k}
            value={v[k as keyof typeof v]}
            options={['', ...options]}
            onChange={(value) => setV({ ...v, [k]: value })}
          />
        ))}
      </div>
      <h3>Excluded categories</h3>
      <div className="flex flex-wrap gap-3">
        {['HOTEL', 'TRANSFER', 'FEE', 'TAX'].map((k) => (
          <label className="flex min-h-11 gap-2 items-center" key={k}>
            <input
              type="checkbox"
              checked={excluded.includes(k)}
              onChange={(e) =>
                setExcluded(e.target.checked ? [...excluded, k] : excluded.filter((c) => c !== k))
              }
            />
            {k}
          </label>
        ))}
      </div>
      {tiers.map((t, i) => (
        <div className="grid gap-3 sm:grid-cols-2" key={i}>
          <Field
            label="Revenue / profit threshold"
            value={t.threshold}
            onChange={(value) =>
              setTiers(tiers.map((r, n) => (n === i ? { ...r, threshold: value } : r)))
            }
          />
          <Field
            label="Tier commission percentage"
            value={t.percentage}
            onChange={(value) =>
              setTiers(tiers.map((r, n) => (n === i ? { ...r, percentage: value } : r)))
            }
          />
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() => setTiers([...tiers, { threshold: '', percentage: '' }])}
      >
        Add tier
      </Button>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => {
            const effectiveAt = new Date(v.effectiveAt);
            if (!Number.isFinite(effectiveAt.getTime())) {
              setValidation('Choose a valid effective date and time.');
              return;
            }
            setValidation('');
            setBusy(true);
            void save('compensation', {
              ...v,
              effectiveAt: effectiveAt.toISOString(),
              tiers,
              excludedCategories: excluded,
            })
              .then(() => data.refetch())
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          Save versioned compensation rule
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save('salary', { month })
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          Record this month’s salaries once
        </Button>
      </div>
      {data.data?.rules.map((r) => (
        <article className="rounded border p-3" key={r.id}>
          <strong>
            {data.data?.staff.find((s) => s.id === r.staffId)?.firstName} · Rule v{r.version}
          </strong>
          <Summary values={r.details} />
        </article>
      ))}
      <CommissionLedger month={month} get={get} save={save} />
      <SharedAllocation staff={data.data?.staff ?? []} save={save} />
    </section>
  );
}
function SharedAllocation({
  staff,
  save,
}: {
  staff: { id: string; firstName: string; lastName: string }[];
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(''),
    [patientId, setPatientId] = useState(''),
    [visit, setVisit] = useState('0'),
    [currency, setCurrency] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  const [allocations, setAllocations] = useState<{ staffId: string; amount: string }[]>([
    { staffId: '', amount: '' },
  ]);
  const patients = usePatients({ search, limit: 20 });
  const patient = patients.data?.data.find((p) => p.id === patientId);
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Shared case commission allocation</h3>
      <p className="text-sm">
        Use only for employees with an effective manual shared-attribution rule. Allocations require
        review and approval; approved payments retain their history.
      </p>
      <Field label="Find existing patient" value={search} onChange={setSearch} />
      <label className="block text-sm">
        Patient and linked deal
        <select
          className="block min-h-11 w-full rounded border p-2"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        >
          <option value="">Select patient</option>
          {patients.data?.data
            .filter((p) => p.convertedFromLeadId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          label="Scope (0 = full case)"
          value={visit}
          onChange={setVisit}
          options={['0', '1', '2']}
        />
        <Field label="Commission currency" value={currency} onChange={setCurrency} />
      </div>
      {allocations.map((allocation, index) => (
        <div className="grid gap-3 sm:grid-cols-2" key={index}>
          <label className="block text-sm">
            Employee
            <select
              className="block min-h-11 w-full rounded border p-2"
              value={allocation.staffId}
              onChange={(e) =>
                setAllocations(
                  allocations.map((row, n) =>
                    n === index ? { ...row, staffId: e.target.value } : row,
                  ),
                )
              }
            >
              <option value="">Select employee</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Approved allocation amount"
            value={allocation.amount}
            onChange={(amount) =>
              setAllocations(allocations.map((row, n) => (n === index ? { ...row, amount } : row)))
            }
          />
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() => setAllocations([...allocations, { staffId: '', amount: '' }])}
      >
        Add employee
      </Button>
      <Field label="Allocation and eligibility review reason" value={reason} onChange={setReason} />
      <Button
        disabled={busy || !patient?.convertedFromLeadId || reason.trim().length < 3}
        onClick={() => {
          setBusy(true);
          void save('commissions/shared', {
            patientId,
            leadId: patient?.convertedFromLeadId,
            visit: Number(visit),
            currency: currency.toUpperCase(),
            allocations,
            reason,
          })
            .then(() => queryClient.invalidateQueries({ queryKey: ['commission-ledger'] }))
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
      >
        Save shared allocation for review
      </Button>
    </section>
  );
}
function CommissionLedger({
  month,
  get,
  save,
}: {
  month: string;
  get: <T>(p: string) => Promise<T>;
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const [page, setPage] = useState(1),
    [reason, setReason] = useState(''),
    [adjustment, setAdjustment] = useState(''),
    [busy, setBusy] = useState(false);
  const result = useQuery<{
    data: {
      id: string;
      staffId: string;
      patientId: string;
      amount: string;
      currency: string;
      state: string;
    }[];
    total: number;
  }>({
    queryKey: ['commission-ledger', month, page],
    queryFn: () => get(`commissions?month=${month}&page=${page}`),
  });
  const action = async (id: string, state: string) => {
    setBusy(true);
    try {
      await save(`commissions/${id}`, { state, reason });
      await result.refetch();
    } catch {
      /* The parent save handler displays the error. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Commission approval and payment ledger</h3>
      <Field label="Approval / payment / adjustment reason" value={reason} onChange={setReason} />
      <Field
        label="Separate adjustment amount (negative for repayment)"
        value={adjustment}
        onChange={setAdjustment}
      />
      {result.isError && <p role="alert">{result.error.message}</p>}
      {result.data?.data.map((row) => (
        <article className="space-y-2 rounded border p-3" key={row.id}>
          <p>
            {row.amount} {row.currency} · {row.state} ·{' '}
            <a className="underline" href={`/patients/${row.patientId}`}>
              Patient
            </a>
          </p>
          <div className="flex flex-wrap gap-2">
            {['EARNED', 'ADJUSTED'].includes(row.state) && (
              <Button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void action(row.id, 'APPROVED')}
              >
                Approve
              </Button>
            )}
            {row.state === 'APPROVED' && (
              <Button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void action(row.id, 'PAID')}
              >
                Record paid
              </Button>
            )}
            {['APPROVED', 'PAID'].includes(row.state) && (
              <Button
                variant="outline"
                disabled={busy || !adjustment || reason.trim().length < 3}
                onClick={() => {
                  setBusy(true);
                  void save(`commissions/${row.id}/adjustments`, {
                    requestId: crypto.randomUUID(),
                    amount: adjustment,
                    reason,
                  })
                    .then(() => result.refetch())
                    .catch(() => {})
                    .finally(() => setBusy(false));
                }}
              >
                Record separate adjustment
              </Button>
            )}
          </div>
        </article>
      ))}
      <div className="flex gap-3">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={page * 30 >= (result.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
function GoogleSettings({
  get,
  save,
}: {
  get: <T>(p: string) => Promise<T>;
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const status = useQuery<{
    configured: boolean;
    connection: { account: string; calendarId: string; status: string } | null;
    required: string[];
    cancellationRule: string;
  }>({ queryKey: ['google-calendar'], queryFn: () => get('google') });
  const [calendars, setCalendars] = useState<{ id: string; summary: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update Google Calendar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Clinic Google Calendar</h2>
      {status.isError && <p role="alert">{status.error.message}</p>}
      {error && <p role="alert">{error}</p>}
      <p>
        Connect the clinic’s chosen Google account. Patient and staff guests are never added; no
        invitation emails are sent.
      </p>
      <p>
        {status.data?.connection?.status ?? 'DISCONNECTED'} ·{' '}
        {status.data?.connection?.account ?? 'No clinic account connected'}
      </p>
      {status.data && !status.data.configured && (
        <p>Required server configuration: {status.data.required.join(', ')}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy || !status.data?.configured}
          onClick={() =>
            void run(() =>
              save('google/connect', {}).then((r) => {
                window.location.assign((r as { url: string }).url);
              }),
            )
          }
        >
          Connect / reconnect clinic Google account
        </Button>
        <Button
          variant="outline"
          disabled={busy || !status.data?.connection}
          onClick={() =>
            void run(() =>
              get<{ items: { id: string; summary: string }[] }>('google/calendars').then((r) =>
                setCalendars(r.items ?? []),
              ),
            )
          }
        >
          Load writable calendars
        </Button>
        <Button
          variant="outline"
          disabled={busy || !status.data?.connection}
          onClick={() => void run(() => save('google/disconnect', {}).then(() => status.refetch()))}
        >
          Disconnect
        </Button>
      </div>
      {!!calendars.length && (
        <label className="block">
          Target calendar
          <select
            className="block min-h-11 w-full rounded border p-2"
            disabled={busy}
            value={status.data?.connection?.calendarId ?? ''}
            onChange={(e) =>
              void run(() =>
                save('google/calendar', { calendarId: e.target.value }).then(() =>
                  status.refetch(),
                ),
              )
            }
          >
            <option value="">Select clinic calendar</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-sm">{status.data?.cancellationRule}</p>
    </section>
  );
}
function Overview({
  month,
  get,
  save,
}: {
  month: string;
  get: <T>(p: string) => Promise<T>;
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const [expenseRequestId, setExpenseRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const result = useQuery<Record<string, unknown>>({
    queryKey: ['operations-overview', month],
    queryFn: () => get('overview?month=' + month),
  });
  const [v, setV] = useState({
    kind: 'FIXED',
    amount: '',
    currency: '',
    status: 'UNPAID',
    description: '',
    reason: '',
  });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Monthly financial overview</h2>
      {result.isError && <p role="alert">{result.error.message}</p>}
      {result.data &&
        Object.entries(result.data).map(([key, value]) => (
          <section className="space-y-2" key={key}>
            <h3 className="font-semibold">{key}</h3>
            {Array.isArray(value) ? (
              value.map((row, i) => <Summary key={i} values={row as Record<string, unknown>} />)
            ) : typeof value === 'object' && value !== null ? (
              <Summary values={value as Record<string, unknown>} />
            ) : (
              <p>{String(value ?? 'Not available')}</p>
            )}
          </section>
        ))}
      <h3 className="font-semibold">Record fixed / variable business expense</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['amount', 'currency', 'description', 'reason'] as const).map((k) => (
          <Field key={k} label={k} value={v[k]} onChange={(value) => setV({ ...v, [k]: value })} />
        ))}
        <Choice
          label="Expense category"
          value={v.kind}
          options={['FIXED', 'VARIABLE', 'OTHER']}
          onChange={(kind) => setV({ ...v, kind })}
        />
        <Choice
          label="Payment status"
          value={v.status}
          options={['UNPAID', 'PAID']}
          onChange={(status) => setV({ ...v, status })}
        />
      </div>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void save('expenses', { ...v, month, id: expenseRequestId })
            .then(() => {
              setExpenseRequestId(crypto.randomUUID());
              return result.refetch();
            })
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
      >
        Save expense
      </Button>
      <ExpenseLedger month={month} get={get} save={save} />
    </section>
  );
}
function ExpenseLedger({
  month,
  get,
  save,
}: {
  month: string;
  get: <T>(p: string) => Promise<T>;
  save: (p: string, b: unknown) => Promise<unknown>;
}) {
  const [page, setPage] = useState(1),
    [reason, setReason] = useState('');
  const result = useQuery<{
    data: {
      id: string;
      kind: string;
      amount: string;
      currency: string;
      status: string;
      details: { description?: string };
    }[];
    total: number;
  }>({
    queryKey: ['expense-ledger', month, page],
    queryFn: () => get(`expenses?month=${month}&page=${page}`),
  });
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Salary and business expense payments</h3>
      <Field label="Expense payment update reason" value={reason} onChange={setReason} />
      {result.isError && <p role="alert">{result.error.message}</p>}
      {result.data?.data.map((row) => (
        <article className="flex flex-wrap items-center gap-3 rounded border p-3" key={row.id}>
          <p>
            {row.kind} · {row.details.description} · {row.amount} {row.currency} · {row.status}
          </p>
          <Button
            variant="outline"
            disabled={reason.trim().length < 3}
            onClick={() =>
              void save(`expenses/${row.id}`, {
                status: row.status === 'PAID' ? 'UNPAID' : 'PAID',
                reason,
              })
                .then(() => result.refetch())
                .catch(() => {})
            }
          >
            Mark {row.status === 'PAID' ? 'unpaid' : 'paid'}
          </Button>
        </article>
      ))}
      <div className="flex gap-3">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={page * 30 >= (result.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
