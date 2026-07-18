'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Archive, Send, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useConversations, useConversation, useSendMessage, useArchiveConversation } from '@/hooks/use-conversations';
import type { ConversationSummary } from '@/hooks/use-conversations';

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

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/40',
        selected && 'bg-muted/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {contact ? `${contact.firstName} ${contact.lastName}` : conv.externalThreadId ?? 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{lastMsg?.content ?? 'No messages yet'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
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
    </button>
  );
}

function MessageThread({ conversationId }: { conversationId: string }) {
  const { data: conv, isLoading } = useConversation(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const archiveConversation = useArchiveConversation();
  const [text, setText] = useState('');

  async function handleSend() {
    if (!text.trim()) return;
    try {
      await sendMessage.mutateAsync(text.trim());
      setText('');
    } catch {
      toast.error('Failed to send message');
    }
  }

  if (isLoading) return <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
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
          <div key={msg.id} className={cn('flex', msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[70%] rounded-2xl px-3 py-2 text-sm',
                msg.direction === 'OUTBOUND'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted rounded-bl-sm',
              )}
            >
              <p>{msg.content ?? '(media)'}</p>
              <p className={cn('text-xs mt-0.5', msg.direction === 'OUTBOUND' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground')}>
                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
        {conv.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet</p>
        )}
      </div>

      <div className="p-3 border-t flex gap-2">
        <Input
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
        />
        <Button size="icon" onClick={handleSend} disabled={!text.trim() || sendMessage.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [channel, setChannel] = useState<string | undefined>(undefined);
  const { data: conversations, isLoading } = useConversations(channel);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            <div className="w-72 border-r overflow-y-auto shrink-0">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 m-2 rounded-lg" />)
                : conversations?.length === 0
                ? (
                  <div className="py-16 text-center text-muted-foreground text-sm px-4">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No conversations yet.
                    <br />
                    Messages from WhatsApp and Facebook will appear here automatically.
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
