'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Archive,
  Send,
  Phone,
  User,
  AlertTriangle,
  RotateCw,
  Check,
  Pin,
  Search,
  Paperclip,
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
import { AttachmentTray } from '@/components/inbox/attachment-tray';
import {
  ImageLightbox,
  MessageAttachment,
  type SentAttachment,
} from '@/components/inbox/message-attachment';
import { useAttachmentUpload, useStorageAvailable } from '@/hooks/use-attachment-upload';
import { UPLOAD_RULES } from '@dental-crm/shared';

/** What the picker offers, taken from the same rule the API enforces. */
const MESSAGE_ATTACHMENT_ACCEPT = UPLOAD_RULES.MESSAGE_ATTACHMENT.accept;

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK_MESSENGER: 'Messenger',
  EMAIL: 'Email',
  SMS: 'SMS',
  IN_APP: 'In-app',
};

const CHANNEL_COLORS: Record<string, 'success' | 'info' | 'secondary' | 'warning' | 'default'> = {
  WHATSAPP: 'success',
  FACEBOOK_MESSENGER: 'info',
  EMAIL: 'secondary',
  SMS: 'warning',
  IN_APP: 'default',
};

function ConversationRow({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const contact = conv.patient ?? conv.lead;
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
        'group relative w-full cursor-pointer border-b px-4 py-3 text-left transition-colors hover:bg-muted/40',
        selected && 'bg-muted/60',
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
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className={cn('truncate text-sm', conv.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
              {contact ? `${contact.firstName} ${contact.lastName}` : conv.externalThreadId ?? 'Unknown'}
            </p>
            {/* An unread thread's preview stays full-strength; a read one recedes. The weight
                difference is what lets someone scan forty rows for the ones needing an answer. */}
            <p className={cn('truncate text-xs', conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground')}>
              {lastMsg?.content ?? 'No messages yet'}
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
          <Badge variant={CHANNEL_COLORS[conv.channel] ?? 'default'} className="text-xs">
            {CHANNEL_LABELS[conv.channel] ?? conv.channel}
          </Badge>
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
  onOpenImage,
}: {
  msg: Message;
  onRetry: () => void;
  retrying: boolean;
  onOpenImage: (file: SentAttachment) => void;
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
              <MessageAttachment key={file.id} file={file} outbound={outbound} onOpenImage={onOpenImage} />
            ))}
          </div>
        )}

        {(hasText || attachments.length === 0) && (
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            failed
              ? 'border border-destructive/30 bg-destructive-muted text-destructive-muted-foreground rounded-br-sm'
              : outbound
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted rounded-bl-sm',
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
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground',
            )}
          >
            {outbound && !failed && msg.status !== 'QUEUED' && <Check className="h-3 w-3" />}
            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
          </p>
        </div>
        )}

        {failed && (
          <div className="flex items-start justify-end gap-2">
            <p className="flex items-start gap-1 text-right text-xs text-destructive-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Not delivered — {msg.failureReason ?? 'the send was rejected'}</span>
            </p>
            <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={onRetry} disabled={retrying}>
              <RotateCw className={cn('mr-1 h-3 w-3', retrying && 'animate-spin')} />
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageThread({ conversationId }: { conversationId: string }) {
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
    if (!conversationId || markedRef.current === conversationId) return;
    markedRef.current = conversationId;
    markRead.mutate(conversationId);
  }, [conversationId, markRead]);
  const { data: conv, isLoading } = threadQuery;
  const sendMessage = useSendMessage(conversationId);
  const retryMessage = useRetryMessage(conversationId);
  const archiveConversation = useArchiveConversation();
  const { data: sending } = useSendingStatus();
  const [text, setText] = useState('');
  const [lightbox, setLightbox] = useState<SentAttachment | null>(null);
  const [dragging, setDragging] = useState(false);
  // Nested drag events fire on every child element, so a plain boolean flickers as the pointer
  // crosses the composer's own contents. Counting enter and leave is what makes the overlay stable.
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploads = useAttachmentUpload(conversationId);
  // Deployment configuration, not a per-message condition. Asked once so the attach button is not
  // offered on a clinic with no bucket — six files picked and six identical failures blames the
  // files rather than the setup.
  const { data: storage } = useStorageAvailable();
  const canAttach = storage?.configured !== false;

  // Anything still going up blocks the send, so a message cannot go out referencing a file that is
  // not there yet.
  const canSend = (!!text.trim() || uploads.fileIds.length > 0) && !uploads.busy && !sendMessage.isPending;

  async function handleSend() {
    // Guarded rather than merely disabled: Enter reaches here whatever the button's state is, and
    // a double-press while the request is in flight would send twice.
    if (!canSend) return;
    try {
      // The API answers with the stored message either way, so a rejection by WhatsApp arrives as
      // a successful response carrying a FAILED status rather than as a thrown error.
      const sent = (await sendMessage.mutateAsync({
        content: text.trim() || undefined,
        fileIds: uploads.fileIds,
      })) as Message;
      setText('');
      uploads.clear();
      if (sent?.status === 'FAILED') {
        toast.error(sent.failureReason ?? 'WhatsApp did not accept the message');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send message');
    }
  }

  /**
   * Files pasted into the composer.
   *
   * The case this exists for is a screenshot: Win+Shift+S then Ctrl+V is how somebody sends a
   * patient a cropped section of an X-ray report, and without this it silently does nothing.
   */
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    // Same gate as the button. Otherwise pasting works where clicking does not, which is the kind
    // of inconsistency that reads as a bug in the paste rather than as missing configuration.
    if (canAttach) uploads.add(files);
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
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="font-semibold">
            {contact ? `${contact.firstName} ${contact.lastName}` : 'Unknown contact'}
          </p>
          {contact?.phone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => archiveConversation.mutateAsync(conversationId).catch(() => toast.error('Failed to archive'))}
        >
          <Archive className="h-4 w-4 mr-1" />
          Archive
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {conv.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onRetry={() => handleRetry(msg.id)}
            retrying={retryMessage.isPending && retryMessage.variables === msg.id}
            onOpenImage={setLightbox}
          />
        ))}
        {conv.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet</p>
        )}
      </div>

      <div
        className="relative border-t p-3"
        onPaste={handlePaste}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (canAttach && files.length) uploads.add(files);
        }}
      >
        {dragging && canAttach && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
            Drop to attach
          </div>
        )}

        <AttachmentTray
          items={uploads.items}
          onCancel={uploads.cancel}
          onRetry={uploads.retry}
          onRemove={uploads.remove}
        />

        {sending && !sending.canSend && (
          <p className="mb-2 flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive-muted px-2.5 py-1.5 text-xs text-destructive-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            WhatsApp is not connected, so anything sent from here will not reach the patient. Link
            the gateway in Settings first.
          </p>
        )}
        <div className="flex gap-2">
          {/* `multiple` and no `capture`: on a phone this offers camera, gallery and the document
              picker, which is the whole mobile requirement. Forcing `capture` would give the
              camera only and take the gallery away. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={MESSAGE_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) uploads.add(files);
              // Reset, or picking the same file twice in a row fires no change event.
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!canAttach}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            title={
              canAttach
                ? 'Attach files'
                : 'File storage is not set up for this clinic yet — see Settings.'
            }
          >
            <Paperclip className="h-4 w-4" />
          </Button>

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
                ? 'Type a message, or drop a file…'
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
            title={uploads.busy ? 'Waiting for the uploads to finish' : 'Send'}
          >
            {sendMessage.isPending || uploads.busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <ImageLightbox file={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function InboxView() {
  // ?c=<id> lets the pipeline hand a coordinator straight into the right thread after opening one
  // from a lead, instead of dropping them at an inbox they then have to search.
  const params = useSearchParams();
  const [channel, setChannel] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
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
    search: debouncedSearch,
    unreadOnly,
    unassignedOnly,
  });
  const { data: conversations, isLoading } = listQuery;
  const [selectedId, setSelectedId] = useState<string | null>(params.get('c'));
  const filtering = !!debouncedSearch.trim() || unreadOnly || unassignedOnly;

  return (
    <div className="space-y-4 h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground mt-1">Manage all patient and lead conversations</p>
      </div>

      <Tabs value={channel ?? 'ALL'} onValueChange={(v) => { setChannel(v === 'ALL' ? undefined : v); setSelectedId(null); }}>
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="WHATSAPP">WhatsApp</TabsTrigger>
          <TabsTrigger value="FACEBOOK_MESSENGER">Messenger</TabsTrigger>
          <TabsTrigger value="EMAIL">Email</TabsTrigger>
        </TabsList>

        <TabsContent value={channel ?? 'ALL'} className="mt-0">
          <Card className="flex h-[calc(100vh-260px)] overflow-hidden">
            <div className="flex w-72 shrink-0 flex-col border-r">
              <div className="space-y-2 border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, number, or a word they said…"
                    aria-label="Search conversations"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <div className="flex gap-1">
                  {/* Two filters, not a panel. These are the only two questions an inbox shared by
                      four people gets asked: what needs an answer, and what has nobody taken. */}
                  <Button
                    size="sm"
                    variant={unreadOnly ? 'default' : 'outline'}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setUnreadOnly((v) => !v)}
                    aria-pressed={unreadOnly}
                  >
                    Unread
                  </Button>
                  <Button
                    size="sm"
                    variant={unassignedOnly ? 'default' : 'outline'}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setUnassignedOnly((v) => !v)}
                    aria-pressed={unassignedOnly}
                  >
                    Unassigned
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 m-2 rounded-lg" />)
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
                            setUnreadOnly(false);
                            setUnassignedOnly(false);
                          }}
                        >
                          Clear them
                        </button>
                      </>
                    ) : (
                      <>
                        No conversations yet.
                        <br />
                        Messages from WhatsApp and Facebook will appear here automatically.
                      </>
                    )}
                  </div>
                )
                : conversations?.map((conv) => (
                    <ConversationRow
                      key={conv.id}
                      conv={conv}
                      selected={conv.id === selectedId}
                      onClick={() => setSelectedId(conv.id)}
                    />
                  ))}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {selectedId ? (
                <MessageThread conversationId={selectedId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm">Select a conversation to view messages</p>
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
