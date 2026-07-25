'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import {
  DEFAULT_PIPELINE_FILTER_FIELDS,
  PIPELINE_FILTER_FIELDS,
  PipelineStage,
  LeadSource,
  TASK_DUE_LABELS,
  TaskDueFilter,
  type PipelineFilterKey,
} from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PipelineFilters } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  CONSULTATION_SCHEDULED: 'Consultation Scheduled',
  CONSULTATION_DONE: 'Consultation Done',
  TREATMENT_PROPOSED: 'Treatment Proposed',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook',
  INSTAGRAM_ADS: 'Instagram',
  GOOGLE: 'Google',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

/** Quick presets. These are the questions actually asked each morning, so they get one click. */
const QUICK_FILTERS: { label: string; filters: PipelineFilters }[] = [
  { label: 'Overdue', filters: { taskDue: TaskDueFilter.OVERDUE } },
  { label: 'Today', filters: { taskDue: TaskDueFilter.TODAY } },
  { label: 'This week', filters: { taskDue: TaskDueFilter.WEEK } },
  { label: 'This month', filters: { taskDue: TaskDueFilter.MONTH } },
  { label: 'No movement', filters: { stuck: true } },
];

const EMPTY: PipelineFilters = {};

function isSet(value: unknown) {
  return value !== undefined && value !== '' && value !== false;
}

/** Human-readable summary of one active filter, for the removable chips. */
function chipLabel(key: PipelineFilterKey, value: unknown, userName: (id: string) => string): string {
  switch (key) {
    case 'search':
      return `“${value}”`;
    case 'assignedToId':
      return userName(String(value));
    case 'stage':
      return STAGE_LABELS[String(value)] ?? String(value);
    case 'source':
      return SOURCE_LABELS[String(value)] ?? String(value);
    case 'taskDue':
      return TASK_DUE_LABELS[value as TaskDueFilter] ?? String(value);
    case 'stuck':
      return 'No movement';
  }
}

export function PipelineFilterBar({
  filters,
  onChange,
}: {
  filters: PipelineFilters;
  onChange: (next: PipelineFilters) => void;
}) {
  const { data: users } = useUsers();
  const [open, setOpen] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [fields, setFields] = useState<PipelineFilterKey[]>([...DEFAULT_PIPELINE_FILTER_FIELDS]);
  // The panel edits a copy so half-built filters do not thrash the board on every keystroke;
  // nothing is applied until Search is pressed.
  const [draft, setDraft] = useState<PipelineFilters>(filters);
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      // The field picker is a portalled dialog, so a click inside it is outside this container —
      // ignore those or choosing a field would close the panel underneath.
      if (fieldPickerOpen) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, fieldPickerOpen]);

  const userName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : 'Unknown';
  };

  const activeChips = (Object.keys(filters) as PipelineFilterKey[]).filter((k) => isSet(filters[k]));

  const applyDraft = () => {
    onChange({ ...draft, search: searchText || undefined });
    setOpen(false);
  };

  const resetAll = () => {
    setDraft(EMPTY);
    setSearchText('');
    onChange(EMPTY);
  };

  const removeChip = (key: PipelineFilterKey) => {
    const next = { ...filters, [key]: undefined };
    if (key === 'search') setSearchText('');
    setDraft(next);
    onChange(next);
  };

  const toggleQuick = (quick: PipelineFilters) => {
    const [key, value] = Object.entries(quick)[0] as [PipelineFilterKey, unknown];
    // Clicking the active preset again clears it, so the same control turns the view on and off.
    const next = { ...filters, [key]: filters[key] === value ? undefined : value };
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        {/* Search row: active filters live inside the field as chips, the way Bitrix shows them,
            so what is narrowing the board is never hidden behind a panel. */}
        <div
          className={cn(
            'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5',
            open && 'ring-1 ring-ring',
          )}
        >
          <SlidersHorizontal className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />

          {activeChips.map((key) => (
            <span
              key={key}
              className="flex items-center gap-1 rounded bg-primary/10 py-0.5 pl-2 pr-1 text-xs font-medium text-primary"
            >
              {chipLabel(key, filters[key], userName)}
              <button
                type="button"
                aria-label={`Remove ${key} filter`}
                className="rounded p-0.5 hover:bg-primary/20"
                onClick={() => removeChip(key)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <input
            className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search name, email or phone…"
            value={searchText}
            onFocus={() => setOpen(true)}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyDraft();
            }}
          />

          {activeChips.length > 0 && (
            <button
              type="button"
              aria-label="Clear all filters"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={resetAll}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Search"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={applyDraft}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-lg border bg-popover p-4 shadow-lg">
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              {/* Left rail mirrors Bitrix's preset list; these are the saved views a clinic
                  actually reaches for rather than user-defined ones. */}
              <div className="space-y-1 border-b pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Quick views</p>
                {QUICK_FILTERS.map((q) => {
                  const [key, value] = Object.entries(q.filters)[0] as [PipelineFilterKey, unknown];
                  const active = filters[key] === value;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => toggleQuick(q.filters)}
                      className={cn(
                        'block w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                        active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                      )}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                {fields.map((key) => (
                  <FilterField
                    key={key}
                    fieldKey={key}
                    value={draft[key]}
                    users={users}
                    onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  />
                ))}

                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setFieldPickerOpen(true)}
                  >
                    Add field
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => setFields([...DEFAULT_PIPELINE_FILTER_FIELDS])}
                  >
                    Restore default fields
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={applyDraft}>
                    <Search className="mr-1.5 h-3.5 w-3.5" /> Search
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetAll}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <FieldPickerDialog
        open={fieldPickerOpen}
        selected={fields}
        onClose={() => setFieldPickerOpen(false)}
        onApply={(next) => {
          setFields(next);
          setFieldPickerOpen(false);
        }}
      />
    </div>
  );
}

function FilterField({
  fieldKey,
  value,
  users,
  onChange,
}: {
  fieldKey: PipelineFilterKey;
  value: unknown;
  users?: { id: string; firstName: string; lastName: string }[];
  onChange: (value: unknown) => void;
}) {
  const field = PIPELINE_FILTER_FIELDS.find((f) => f.key === fieldKey)!;
  // "Any" needs a non-empty value because Radix Select reserves the empty string for "no selection".
  const ANY = '__any__';
  const asSelect = (options: { value: string; label: string }[]) => (
    <Select
      value={(value as string) || ANY}
      onValueChange={(v) => onChange(v === ANY ? undefined : v)}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Any" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{field.label}</Label>
      {fieldKey === 'search' && (
        <Input
          className="h-9"
          placeholder={field.hint}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      )}
      {fieldKey === 'assignedToId' &&
        asSelect((users ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })))}
      {fieldKey === 'stage' &&
        asSelect(Object.values(PipelineStage).map((s) => ({ value: s, label: STAGE_LABELS[s] ?? s })))}
      {fieldKey === 'source' &&
        asSelect(Object.values(LeadSource).map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s })))}
      {fieldKey === 'taskDue' &&
        asSelect(
          Object.values(TaskDueFilter).map((t) => ({ value: t, label: TASK_DUE_LABELS[t] })),
        )}
      {fieldKey === 'stuck' && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true || undefined)} />
          No stage change in two weeks
        </label>
      )}
    </div>
  );
}

function FieldPickerDialog({
  open,
  selected,
  onClose,
  onApply,
}: {
  open: boolean;
  selected: PipelineFilterKey[];
  onClose: () => void;
  onApply: (fields: PipelineFilterKey[]) => void;
}) {
  const [draft, setDraft] = useState<PipelineFilterKey[]>(selected);
  const [query, setQuery] = useState('');

  // Reopening should show what is currently applied, not whatever was abandoned last time.
  useEffect(() => {
    if (open) {
      setDraft(selected);
      setQuery('');
    }
  }, [open, selected]);

  const visible = PIPELINE_FILTER_FIELDS.filter((f) =>
    f.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Filter field settings</DialogTitle>
        </DialogHeader>

        <Input placeholder="Find field" value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto py-2">
          {visible.map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
              <Checkbox
                checked={draft.includes(f.key)}
                onCheckedChange={(c) =>
                  setDraft((d) => (c === true ? [...d, f.key] : d.filter((k) => k !== f.key)))
                }
              />
              {f.label}
            </label>
          ))}
          {visible.length === 0 && (
            <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">No matching field.</p>
          )}
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setDraft([...DEFAULT_PIPELINE_FILTER_FIELDS])}
          >
            Restore defaults
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onApply(draft)}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
