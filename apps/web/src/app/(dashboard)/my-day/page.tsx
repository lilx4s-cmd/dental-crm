'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_LABELS } from '@dental-crm/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkList, type WorkItem } from '@/hooks/use-work-list';
import { useDraftWhatsAppMessage, isAiNotConfiguredError } from '@/hooks/use-ai';
import { normalizePhoneForWhatsApp } from '@/lib/whatsapp';
import { LeadDetailSheet } from '@/components/pipeline/lead-detail-sheet';
import type { Lead } from '@/hooks/use-leads';

const AI_NOT_CONFIGURED = 'AI drafting is not configured for this clinic';

function WorkRow({
  item,
  recycling,
  onOpen,
}: {
  item: WorkItem;
  recycling?: boolean;
  onOpen: (lead: Lead) => void;
}) {
  const { lead, action } = item;
  const draft = useDraftWhatsAppMessage();
  const [drafting, setDrafting] = useState(false);

  const phone = normalizePhoneForWhatsApp(lead.whatsappNumber || lead.phone || '');

  // The rules decide who needs a message; the model only writes it. Sending the recycle angle as
  // context matters — "just following up" three months later reads as a form letter.
  const writeMessage = () => {
    setDrafting(true);
    draft.mutate(
      {
        context: recycling
          ? `${action.action}. ${item.recycleAngle ?? ''} It has been ${action.overdueDays} days since anything happened.`
          : `${action.action}. The deal is at the "${STAGE_LABELS[lead.stage] ?? lead.stage}" stage.`,
      },
      {
        onSuccess: ({ message }) => {
          if (!phone) {
            toast.error('No WhatsApp number on file for this deal');
            return;
          }
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
        },
        onError: (err) =>
          toast.error(isAiNotConfiguredError(err) ? AI_NOT_CONFIGURED : 'Could not draft a message'),
        onSettled: () => setDrafting(false),
      },
    );
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-t px-4 py-3 first:border-t-0">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onOpen(lead)}
      >
        <p className="truncate text-sm font-medium">
          {lead.firstName} {lead.lastName ?? ''}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {action.action} · {STAGE_LABELS[lead.stage] ?? lead.stage}
        </p>
      </button>

      <Badge
        variant={
          recycling ? 'secondary' : action.urgency === 'overdue' ? 'destructive' : 'warning'
        }
        className="shrink-0"
      >
        {recycling
          ? `${action.overdueDays}d cold`
          : action.urgency === 'overdue'
            ? `${action.overdueDays}d late`
            : 'Due today'}
      </Badge>

      {phone && (
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full p-1.5 text-success transition-colors hover:bg-success-muted"
          title="Open WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      )}

      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 text-xs"
        onClick={writeMessage}
        disabled={drafting}
      >
        <Sparkles className="mr-1 h-3 w-3" />
        {drafting ? 'Writing…' : 'Draft message'}
      </Button>
    </li>
  );
}

function List({
  items,
  recycling,
  emptyTitle,
  emptyBody,
  onOpen,
}: {
  items: WorkItem[];
  recycling?: boolean;
  emptyTitle: string;
  emptyBody: string;
  onOpen: (lead: Lead) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        <p className="mt-2 font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border">
      {items.map((item) => (
        <WorkRow key={item.lead.id} item={item} recycling={recycling} onOpen={onOpen} />
      ))}
    </ul>
  );
}

/**
 * The morning list: who to contact, and what about.
 *
 * Both lists are computed from the pipeline's own data by rules, not by a model — how long a deal
 * has sat in a stage is a fact, and guessing at it would be slower and sometimes wrong. The model
 * writes the message, once the rules have decided who needs one.
 */
export default function MyDayPage() {
  const { data, isLoading } = useWorkList();
  const [detail, setDetail] = useState<Lead | null>(null);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Day</h1>
        <p className="mt-1 text-muted-foreground">
          Deals that need chasing, and cold ones worth another try.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="due">
          <TabsList>
            <TabsTrigger value="due" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              To contact{data?.counts.due ? ` (${data.counts.due})` : ''}
            </TabsTrigger>
            <TabsTrigger value="recycle" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Recycle{data?.counts.dormant ? ` (${data.counts.dormant})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="due" className="mt-4">
            <List
              items={data?.due ?? []}
              onOpen={setDetail}
              emptyTitle="Nothing overdue"
              emptyBody="Every open deal has been touched within its follow-up window. Deals with a task already on them are left off this list."
            />
          </TabsContent>

          <TabsContent value="recycle" className="mt-4 space-y-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Cold deals</CardTitle>
                <CardDescription>
                  Gone quiet long enough that the normal follow-up has stopped. Worth one different
                  approach rather than another chase — the drafted message uses an angle suited to
                  how far each one got.
                </CardDescription>
              </CardHeader>
            </Card>
            <List
              items={data?.dormant ?? []}
              recycling
              onOpen={setDetail}
              emptyTitle="Nothing gone cold"
              emptyBody="No open deal has been sitting untouched past its stage's limit."
            />
          </TabsContent>
        </Tabs>
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.counts.openPipeline} open deals in total.
        </p>
      )}

      <LeadDetailSheet lead={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
