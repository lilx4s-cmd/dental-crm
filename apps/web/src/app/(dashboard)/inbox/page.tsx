'use client';

import { ConversationDealAction } from '@/components/pipeline/conversation-deal-action';

import { hasPermission } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { apiRequest } from '@/lib/api-client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  MessageSquare,
  Archive,
  Send,
  Phone,
  User,
  AlertTriangle,
  RotateCw,
  Check,
  CheckCheck,
  Pin,
  Search,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  useConversations,
  useConversation,
  useSendMessage,
  useArchiveConversation,
  useRetryMessage,
  useSendingStatus,
  useMarkConversationRead,
  usePinConversation,
} from '@/hooks/use-conversations';
import type { ConversationSummary, Message } from '@/hooks/use-conversations';
import { QueryError } from '@/components/ui/query-state';
import { TemplatePicker } from '@/components/inbox/template-picker';
import {
  ImageLightbox,
  MessageAttachment,
  type SentAttachment,
} from '@/components/inbox/message-attachment';
const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK_MESSENGER: 'Messenger',
  EMAIL: 'Email',
  SMS: 'SMS',
  IN_APP: 'In-app',
};

type InboxSession = {
  sessionId: string;
  linkedNumber: string | null;
  state: string;
  user?: { firstName: string; lastName: string };
};

const CHANNEL_COLORS: Record<string, 'success' | 'info' | 'secondary' | 'warning' | 'default'> = {
  WHATSAPP: 'success',
  FACEBOOK_MESSENGER: 'info',
  EMAIL: 'secondary',
  SMS: 'warning',
  IN_APP: 'default',
};

function contactLabel(conv: ConversationSummary) {
  const contact = conv.patient ?? conv.lead;
  return conv.whatsappContactName || (contact ? `${contact.firstName} ${contact.lastName}` : conv.externalThreadId?.endsWith('@lid') ? 'WhatsApp contact' : conv.externalThreadId ? `+${conv.externalThreadId}` : 'Unknown contact');
}

function ConversationRow({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const lastMsg = conv.messages[0];
  const pin = usePinConversation();

  return (
    // A div rather than a button, because the pin control sits inside it and a button inside a
    // button is invalid markup that browsers resolve by dropping one of them.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group relative w-full cursor-pointer border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/40',
        selected && 'bg-wa-selected',
      )}
    >
      {/* Appears on hover, stays visible once pinned — a pinned thread has to advertise why it is
          sitting at the top out of date order. */}
      <button
        type="button"
        aria-label={conv.isPinned ? 'Unpin this conversation' : 'Pin to the top of the inbox'}
        title={conv.isPinned ? 'Unpin' : 'Pin to the top'}
        onClick={(e) => {
          e.stopPropagation();
          pin.mutate(
            { id: conv.id, pinned: !conv.isPinned },
            { onError: () => toast.error('Could not change the pin') },
          );
        }}
        className={cn(
          'absolute right-2 top-2 rounded p-1 transition-opacity',
          conv.isPinned
            ? 'text-primary opacity-100'
            : 'text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100',
          'hover:bg-muted',
        )}
      >
        <Pin className={cn('h-3.5 w-3.5', conv.isPinned && 'fill-current')} />
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className={cn('truncate text-sm', conv.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
              {contactLabel(conv)}
            </p>
            {/* An unread thread's preview stays full-strength; a read one recedes. The weight
                difference is what lets someone scan forty rows for the ones needing an answer. */}
            <p className={cn('truncate text-xs', conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground')}>
              {lastMsg?.content ?? 'History not shared by WhatsApp yet'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pr-5">
          {conv.unreadCount > 0 && (
            <span
              className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
              aria-label={`${conv.unreadCount} unread`}
            >
              {conv.unreadCount}
            </span>
          )}
          {conv.channel !== 'WHATSAPP' && <Badge variant={CHANNEL_COLORS[conv.channel] ?? 'default'} className="text-xs">
            {CHANNEL_LABELS[conv.channel] ?? conv.channel}
          </Badge>}
          {conv.lastMessageAt && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One message.
 *
 * A failed outbound message is drawn as a warning rather than as a normal sent bubble, because the
 * default reading of a message sitting in a thread is "the patient has it". Silence after a
 * treatment quote means something very different depending on whether the quote actually arrived.
 */
function MessageBubble({
  msg,
  onRetry,
  retrying,
  readOnly = false,
  onOpenImage,
  travelDealId,
}: {
  msg: Message;
  onRetry: () => void;
  retrying: boolean;
  readOnly?: boolean;
  onOpenImage: (file: SentAttachment) => void;
  travelDealId?: string;
}) {
  const outbound = msg.direction === 'OUTBOUND';
  const failed = msg.status === 'FAILED';
  const attachments = msg.attachments?.map((a) => a.file) ?? [];
  // An attachment-only message is legitimate — a photo is a message. The bubble must not print
  // "(media)" underneath one, which is what the old placeholder did for anything without text.
  const hasText = !!msg.content?.trim();

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[70%] space-y-1">
        {attachments.length > 0 && (
          <div className={cn('flex flex-col gap-1.5', outbound && 'items-end')}>
            {attachments.map((file) => (
              <div key={file.id}>
                <MessageAttachment file={file} outbound={outbound} onOpenImage={onOpenImage} />
                {travelDealId && ['application/pdf','image/jpeg','image/png','image/webp'].includes(file.mimeType) &&
                  <a className="inline-flex min-h-11 items-center text-xs underline" href={`/travel?leadId=${encodeURIComponent(travelDealId)}&fileId=${encodeURIComponent(file.id)}`}>Attach as flight ticket to a treatment visit</a>}
              </div>
            ))}
          </div>
        )}

        {(hasText || attachments.length === 0) && (
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm shadow-sm',
            failed
              ? 'border border-destructive/30 bg-destructive-muted text-destructive-muted-foreground rounded-br-sm'
              : outbound
                ? 'bg-wa-outgoing text-wa-text rounded-tr-none'
                : 'bg-wa-incoming text-wa-text rounded-tl-none',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{msg.content ?? '(media)'}</p>
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1 text-xs',
              outbound && 'justify-end',
              failed
                ? 'text-destructive-muted-foreground/80'
                : outbound
                  ? 'text-wa-muted'
                  : 'text-wa-muted',
            )}
          >
            {outbound && !failed && (msg.status === 'READ' || msg.status === 'DELIVERED' ? <CheckCheck aria-label={msg.status === 'READ' ? 'Read' : 'Delivered'} className={cn('h-3.5 w-3.5', msg.status === 'READ' && 'text-info')} /> : msg.status === 'SENT' ? <Check aria-label="Sent" className="h-3 w-3" /> : null)}
            <time dateTime={msg.createdAt} title={format(new Date(msg.createdAt), 'PPpp')}>{format(new Date(msg.createdAt), 'HH:mm')}</time>
          </p>
        </div>
        )}

        {failed && (
          <div className="flex items-start justify-end gap-2">
            <p className="flex items-start gap-1 text-right text-xs text-destructive-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Not delivered — {msg.failureReason ?? 'the send was rejected'}</span>
            </p>
            {!readOnly && <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={onRetry} disabled={retrying}>
              <RotateCw className={cn('mr-1 h-3 w-3', retrying && 'animate-spin')} />
              Retry
            </Button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationList({ conversations, selectedId, onSelect }: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 6,
    initialRect: { width: 360, height: 600 },
    getItemKey: index => conversations[index].id,
  });
  return (
    <div ref={scrollRef} role="list" tabIndex={0} aria-label="WhatsApp chats" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => {
          const conv = conversations[item.index];
          return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}
            role="listitem" aria-posinset={item.index + 1} aria-setsize={conversations.length}
            className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
            <ConversationRow conv={conv} selected={conv.id === selectedId} onClick={() => onSelect(conv.id)} />
          </div>;
        })}
      </div>
    </div>
  );
}

function MessageThread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { user } = useAuth();
  const manager = hasPermission(user, 'conversations.supervise', user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER');
  const readOnly = !hasPermission(user, 'conversations.send', user?.role === 'SALES_CONSULTANT' || user?.role === 'RECEPTION');
  const threadQuery = useConversation(conversationId);
  const markRead = useMarkConversationRead();
  // Which thread has already been marked, so a re-render does not send the same PATCH again. A ref
  // rather than an exhaustive-deps suppression: the mutation object changes identity on every
  // render, so listing it as a dependency would fire the effect in a loop.
  const markedRef = useRef<string | null>(null);

  // Opening a thread is what "read" means here — deliberately not a side effect of the GET, so two
  // people with the inbox open do not have one clearing the other's badge just by the list
  // refreshing.
  useEffect(() => {
    if (manager || !conversationId || markedRef.current === conversationId) return;
    markedRef.current = conversationId;
    markRead.mutate(conversationId);
  }, [conversationId, markRead, user?.role]);
  const { data: conv, isLoading } = threadQuery;
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane && followLatest.current) pane.scrollTop = pane.scrollHeight;
  }, [conv?.messages.length]);
  const sendMessage = useSendMessage(conversationId);
  const retryMessage = useRetryMessage(conversationId);
  const archiveConversation = useArchiveConversation();
  const { data: sending } = useSendingStatus(conversationId);
  const [text, setText] = useState('');
  const [lightbox, setLightbox] = useState<SentAttachment | null>(null);
  const canSend = !readOnly && conv?.channel === 'WHATSAPP' && !!text.trim() && sending?.canSend === true && !sendMessage.isPending;

  async function handleSend() {
    // Guarded rather than merely disabled: Enter reaches here whatever the button's state is, and
    // a double-press while the request is in flight would send twice.
    if (!canSend) return;
    try {
      // The API answers with the stored message either way, so a rejection by WhatsApp arrives as
      // a successful response carrying a FAILED status rather than as a thrown error.
      const sent = (await sendMessage.mutateAsync({
        content: text.trim() || undefined,
      })) as Message;
      setText('');
      if (sent?.status === 'FAILED') {
        toast.error(sent.failureReason ?? 'WhatsApp did not accept the message');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send message');
    }
  }

  async function handleRetry(messageId: string) {
    try {
      const sent = (await retryMessage.mutateAsync(messageId)) as Message;
      if (sent?.status === 'FAILED') toast.error(sent.failureReason ?? 'Still not going through');
      else toast.success('Message sent');
    } catch {
      toast.error('Could not retry');
    }
  }

  if (isLoading) return <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  // A thread that fails to load rendered as a blank panel, which reads as "no messages" next to a
  // conversation row that says there are some.
  if (threadQuery.isError) return <QueryError error={threadQuery.error} onRetry={threadQuery.refetch} variant="page" />;
  if (!conv) return null;

  const contact = conv.patient ?? conv.lead;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-wa-header px-4 py-3 border-b">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to chats"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1 break-words">
          <p className="font-semibold">
            {contactLabel(conv)}
          </p>
          <p className="text-xs text-muted-foreground">{conv.whatsappSessionId === 'default' ? 'Shared clinic account' : `Work account · ${conv.assignedTo ? `${conv.assignedTo.firstName} ${conv.assignedTo.lastName}` : 'Team member'}`}</p>
          {contact?.phone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </div>
          )}
        </div>
        <ConversationDealAction conversation={conv} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => archiveConversation.mutateAsync(conversationId).catch(() => toast.error('Failed to archive'))}
        >
          <Archive className="h-4 w-4 mr-1" />
          Archive
        </Button>
      </div>

      <div ref={scrollRef} onScroll={() => { const pane = scrollRef.current; if (pane) followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100; }} className="flex-1 overflow-y-auto bg-wa-wallpaper p-4 md:px-8 space-y-3">
        {conv.messages.map((msg, index) => (
          <div key={msg.id}>
          {(index === 0 || format(new Date(conv.messages[index - 1].createdAt), 'yyyy-MM-dd') !== format(new Date(msg.createdAt), 'yyyy-MM-dd')) && <div className="mb-3 text-center"><span className="rounded-md bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm">{format(new Date(msg.createdAt), 'MMM d, yyyy')}</span></div>}
          <MessageBubble
            key={msg.id}
            msg={msg}
            readOnly={readOnly}
            onRetry={() => { if (!manager) void handleRetry(msg.id); }}
            retrying={retryMessage.isPending && retryMessage.variables === msg.id}
            onOpenImage={setLightbox}
            travelDealId={conv.lead?.id}
          />
          </div>
        ))}
        {conv.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">This chat is saved. WhatsApp has not shared its message history with this linked device yet.</p>
        )}
      </div>

      {readOnly || conv.channel !== 'WHATSAPP' ? <p className="border-t p-3 text-sm text-muted-foreground">{manager ? 'Manager view · Read team conversations and monitor patient contact here.' : 'This channel has no connected sending service. Messages are read-only.'}</p> : <div className="border-t p-3">
        {sending && !sending.canSend && (
          <p className="mb-2 flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive-muted px-2.5 py-1.5 text-xs text-destructive-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            WhatsApp is not connected, so anything sent from here will not reach the patient. Reconnect the work number on the Work WhatsApp page.
          </p>
        )}
        <div className="flex gap-2">
          <TemplatePicker
            recipient={contact}
            disabled={sendMessage.isPending}
            // Appended rather than replacing: someone who has already typed "Hi, following up —"
            // and then reaches for the price list meant both.
            onInsert={(body) => setText((current) => (current.trim() ? `${current.trimEnd()}

${body}` : body))}
          />
          <Input
            placeholder={
              conv.channel === 'WHATSAPP'
                ? 'Type a message…'
                : `Sending on ${conv.channel} is not connected yet`
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            title="Send" aria-label="Send message"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>}

      <ImageLightbox file={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function InboxView() {
  // ?c=<id> lets the pipeline hand a coordinator straight into the right thread after opening one
  // from a lead, instead of dropping them at an inbox they then have to search.
  const params = useSearchParams();
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const manager = hasPermission(user, 'conversations.supervise', user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER');
  const ownSessionId = user ? `user:${user.sub}` : undefined;
  const leadFilter = params.get('lead');
  const selectedParam = params.get('c');
  const requestedSession = params.get('session');
  const directThread = useConversation(selectedParam ?? '');
  const sessionFilter = requestedSession ?? directThread.data?.whatsappSessionId ?? (leadFilter ? undefined : ownSessionId);
  const scopeReady = !!user && (!selectedParam || !!requestedSession || directThread.isSuccess || directThread.isError);
  const mine = useQuery<InboxSession>({
    queryKey: ['whatsapp-session', user?.sub],
    queryFn: () => apiRequest('/api/whatsapp/sessions/me', {}, accessToken ?? undefined),
    enabled: !!accessToken,
    refetchInterval: 15_000,
  });
  const team = useQuery<InboxSession[]>({
    queryKey: ['whatsapp-team', user?.sub],
    queryFn: () => apiRequest('/api/whatsapp/sessions', {}, accessToken ?? undefined),
    enabled: manager && !!accessToken,
    refetchInterval: 15_000,
  });
  const selectedAccount = sessionFilter === ownSessionId ? mine.data : team.data?.find(account => account.sessionId === sessionFilter);
  const [channel, setChannel] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [archived, setArchived] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Debounced, because the inbox polls every ten seconds and every keystroke would otherwise start
  // a search across message bodies.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const listQuery = useConversations({
    channel,
    whatsappSessionId: sessionFilter,
    leadId: leadFilter ?? undefined,
    search: debouncedSearch,
    unreadOnly,
    unassignedOnly,
    isArchived: archived,
  }, scopeReady);
  const { data: conversations, isLoading } = listQuery;
  const [selectedId, setSelectedId] = useState<string | null>(params.get('c'));
  const filtering = !!debouncedSearch.trim() || unreadOnly || unassignedOnly || archived || !!leadFilter;
  useEffect(() => { setSelectedId(selectedParam); }, [sessionFilter, leadFilter, selectedParam]);
  const activeThreadId = selectedId && (
    conversations?.some(conversation => conversation.id === selectedId && (!sessionFilter || conversation.whatsappSessionId === sessionFilter)) ||
    (selectedId === selectedParam && directThread.data?.id === selectedId && (!sessionFilter || directThread.data.whatsappSessionId === sessionFilter))
  ) ? selectedId : null;

  return (
    <div className="space-y-4 h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp & conversations</h1>
        <p className="text-muted-foreground mt-1">{sessionFilter ? 'Chats for one linked WhatsApp work account' : 'Conversation history for this patient'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="inbox-work-account">WhatsApp account</label>
          <select id="inbox-work-account" value={sessionFilter ?? ''} disabled={!user} className="h-9 max-w-full rounded-md border bg-background px-2" onChange={event => {
            const next = new URLSearchParams(params.toString());
            next.set('session', event.target.value);
            next.delete('c'); next.delete('lead');
            setSelectedId(null);
            router.replace(`/inbox?${next.toString()}`);
          }}>
            {!sessionFilter && <option value="">Patient history across work accounts</option>}
            <option value={ownSessionId ?? ''}>My WhatsApp{mine.data?.linkedNumber ? ` · +${mine.data.linkedNumber}` : ''}</option>
            {manager && <option value="default">Shared clinic WhatsApp</option>}
            {team.data?.filter(account => account.sessionId !== ownSessionId).map(account => <option key={account.sessionId} value={account.sessionId}>{account.user?.firstName} {account.user?.lastName}{account.linkedNumber ? ` · +${account.linkedNumber}` : ' · Not linked'}</option>)}
            {sessionFilter && sessionFilter !== ownSessionId && sessionFilter !== 'default' && !team.data?.some(account => account.sessionId === sessionFilter) && <option value={sessionFilter}>Selected work account</option>}
          </select>
          {selectedAccount && <Badge variant={selectedAccount.state === 'connected' ? 'success' : 'secondary'}>{selectedAccount.state === 'connected' ? 'Connected' : 'Offline · saved chats'}</Badge>}
          <Link href="/whatsapp" className="text-primary underline">Connections</Link>
          {leadFilter && <Link href="/inbox" className="text-primary underline">My WhatsApp inbox</Link>}
        </div>
      </div>

      <Tabs value={channel ?? 'ALL'} onValueChange={(v) => { setChannel(v === 'ALL' ? undefined : v); setSelectedId(null); }}>
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="WHATSAPP">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value={channel ?? 'ALL'} className="mt-0">
          <Card className="flex h-[calc(100dvh-235px)] min-h-[400px] overflow-hidden rounded-xl">
            <div className={cn("flex w-full md:w-[360px] lg:w-[390px] shrink-0 flex-col border-r", activeThreadId && "hidden md:flex")}>
              <div className="flex items-center justify-between px-4 py-4">
                <h2 className="text-xl font-semibold">Chats <span className="text-sm font-normal text-muted-foreground">{conversations?.length ?? 0}</span></h2>
                <Link href="/whatsapp" className="text-xs text-success hover:underline">Connections</Link>
              </div>
              <div className="space-y-2 border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search or start reading a chat"
                    aria-label="Search conversations"
                    className="h-10 rounded-full border-0 bg-muted pl-8 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant={!unreadOnly && !unassignedOnly && !archived ? 'default' : 'outline'} className="h-7 rounded-full text-xs" onClick={() => { setUnreadOnly(false); setUnassignedOnly(false); setArchived(false); }}>All</Button>
                  <Button size="sm" variant={archived ? 'default' : 'outline'} className="h-7 rounded-full text-xs" aria-pressed={archived} onClick={() => { setArchived(v => !v); setSelectedId(null); }}>Archived</Button>
                  {/* Two filters, not a panel. These are the only two questions an inbox shared by
                      four people gets asked: what needs an answer, and what has nobody taken. */}
                  <Button
                    size="sm"
                    variant={unreadOnly ? 'default' : 'outline'}
                    className="h-7 rounded-full text-xs"
                    onClick={() => setUnreadOnly((v) => !v)}
                    aria-pressed={unreadOnly}
                  >
                    Unread
                  </Button>
                  <Button
                    size="sm"
                    variant={unassignedOnly ? 'default' : 'outline'}
                    className="h-7 rounded-full text-xs"
                    onClick={() => setUnassignedOnly((v) => !v)}
                    aria-pressed={unassignedOnly}
                  >
                    Unassigned
                  </Button>
                </div>
              </div>

              {conversations?.length && !isLoading && scopeReady && !listQuery.isError ? (
                <ConversationList key={`${sessionFilter ?? ''}:${leadFilter ?? ''}:${channel ?? ''}:${debouncedSearch}:${unreadOnly}:${unassignedOnly}:${archived}`}
                  conversations={conversations} selectedId={activeThreadId} onSelect={setSelectedId} />
              ) : <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading
                || !scopeReady ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 m-2 rounded-lg" />)
                : listQuery.isError
                ? <QueryError error={listQuery.error} onRetry={listQuery.refetch} className="px-4 py-16" />
                : conversations?.length === 0
                ? (
                  <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {/* "No conversations yet" under an active filter is a lie, and the kind that
                        sends someone to check whether WhatsApp is broken. */}
                    {filtering ? (
                      <>
                        Nothing matches those filters.
                        <br />
                        <button
                          type="button"
                          className="mt-2 text-primary hover:underline"
                          onClick={() => {
                            setSearch('');
                            setArchived(false);
                            setUnreadOnly(false);
                            setUnassignedOnly(false);
                            setChannel(undefined);
                            setSelectedId(null);
                            router.replace('/inbox');
                          }}
                        >
                          Clear them
                        </button>
                      </>
                    ) : (
                      <>
                        No conversations yet.
                        <br />
                        This account has no synced chats yet. Check its connection in <Link href="/whatsapp" className="text-primary underline">Work WhatsApp</Link>.
                      </>
                    )}
                  </div>
                )
                : null}
              </div>}
            </div>

            <div className={cn("flex-1 min-w-0", !activeThreadId && "hidden md:block")}>
              {activeThreadId ? (
                <MessageThread key={activeThreadId} conversationId={activeThreadId} onBack={() => setSelectedId(null)} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-xl font-medium">Your work WhatsApp</p>
                  <p className="mt-2 text-sm">Select a chat to read the conversation</p>
                  <p className="mt-3 max-w-sm px-4 text-center text-xs">{sessionFilter ? 'Only chats for the selected work account appear here. Sent messages and replies stay together in each contact’s chat.' : 'This patient’s history can include separate conversations on different work accounts.'} Older messages appear when WhatsApp shares them.</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// useSearchParams opts the tree out of static rendering, and Next requires the boundary to be
// explicit rather than inferring one.
export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-lg" />}>
      <InboxView />
    </Suspense>
  );
}
