"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@dental-crm/shared';
import type { TelnyxRTC, INotification } from '@telnyx/webrtc';
import type Call from '@telnyx/webrtc/lib/src/Modules/Verto/webrtc/Call';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type QueueRow = { id: string; name: string; phone: string; canCall: boolean; lastCall: { occurredAt: string; outcome: string } | null };
type Status = { ready: boolean; configured: boolean; enabled: boolean; canPlaceCalls: boolean; callerNumber: string | null };
type Attempt = { userId: string; id: string; leadId: string; phoneNumber: string; status: string; answeredAt: string | null; failureReason: string | null; callLog: { outcome: string; notes: string | null; durationSeconds: number } | null };
const terminal = (status?: string) => !!status && ['ENDED', 'FAILED', 'CANCELLED'].includes(status);
const labels: Record<string, string> = { STAFF_RINGING: 'Answer on your headset to dial the patient', PATIENT_RINGING: 'Patient is ringing', PATIENT_CONNECTING: 'Waiting for patient call confirmation', CONNECTED: 'Connected', CANCELLING: 'Cancelling call…', ENDED: 'Call ended', FAILED: 'Call failed', CANCELLED: 'Call ended by staff' };

export default function CallingPage() {
  const { user } = useAuth();
  return <CallingWorkspace key={user?.sub ?? 'signed-out'} />;
}

function CallingWorkspace() {
  const { user, accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('ANSWERED');
  const [followUp, setFollowUp] = useState('');
  const [advance, setAdvance] = useState(false);
  const client = useRef<TelnyxRTC | null>(null);
  const call = useRef<Call | null>(null);
  const currentAttempt = useRef<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const connectingRef = useRef(false);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const readAllowed = !!user && hasPermission(user, 'calls.read', ['SUPER_ADMIN', 'CLINIC_MANAGER', 'SALES_CONSULTANT', 'RECEPTION'].includes(user.role));
  const request = useCallback(<T,>(path: string, options: RequestInit = {}) => apiRequest<T>(`/api/calling/${path}`, options, accessToken ?? undefined), [accessToken]);
  const requestRef = useRef(request);
  requestRef.current = request;
  const scope = user?.sub;
  const { data: status, error: statusError } = useQuery({ queryKey: ['calling-status', scope], queryFn: () => request<Status>('status'), enabled: readAllowed, refetchInterval: 30000 });
  const { data: queue = [], isLoading, error: queueError } = useQuery({ queryKey: ['calling-queue', scope, querySearch], queryFn: () => request<QueueRow[]>(`queue?search=${encodeURIComponent(querySearch)}`), enabled: readAllowed });
  const { data: attempt, error: attemptError } = useQuery({ queryKey: ['calling-attempt', scope, attemptId], queryFn: () => request<Attempt>(`attempts/${attemptId}`), enabled: readAllowed && !!attemptId, refetchInterval: query => terminal(query.state.data?.status) ? false : 5000 });
  const { data: history = [] } = useQuery({ queryKey: ['calling-history', scope], queryFn: () => request<Attempt[]>('history'), enabled: readAllowed, refetchInterval: 60000 });
  const canCall = !!status?.canPlaceCalls && !!status.ready;
  const active = !!attemptId && !terminal(attempt?.status);

  useEffect(() => { const timer = setTimeout(() => setQuerySearch(search), 250); return () => clearTimeout(timer); }, [search]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    setSelected(null); setAttemptId(null); setConnected(false); setConnecting(false); setIncoming(false); setMuted(false); setNotes(''); setFollowUp('');
    return () => {
      mounted.current = false; generation.current += 1;
      call.current?.hangup();
      client.current?.disconnect();
      if (currentAttempt.current) void requestRef.current(`attempts/${currentAttempt.current}/stop`, { method: 'POST', keepalive: true }).catch(() => undefined);
      call.current = null; client.current = null; currentAttempt.current = null;
    };
  }, [scope]);

  useEffect(() => {
    if (terminal(attempt?.status)) {
      currentAttempt.current = null;
      call.current?.hangup(); call.current = null;
      setIncoming(false); setMuted(false);
      if (attempt?.callLog) setOutcome(attempt.callLog.outcome);
    }
  }, [attempt?.status, attempt?.callLog]);

  useEffect(() => {
    const pending = history.find(row => row.userId === scope && !terminal(row.status));
    if (pending && !attemptId) {
      setAttemptId(pending.id); currentAttempt.current = pending.id;
      setSelected(queue.find(row => row.id === pending.leadId) ?? { id: pending.leadId, name: 'Active call', phone: pending.phoneNumber, canCall: false, lastCall: null });
    }
  }, [history, attemptId, scope, queue]);

  async function connect() {
    if (connectingRef.current || client.current) return;
    connectingRef.current = true; setConnecting(true);
    const currentGeneration = generation.current;
    try {
      // Browser permission is requested only after the staff member presses Connect headset.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      const [{ TelnyxRTC: RTC }, session] = await Promise.all([import('@telnyx/webrtc'), request<{ loginToken: string }>('session', { method: 'POST' })]);
      if (!mounted.current || generation.current !== currentGeneration) return;
      const rtc = new RTC({ login_token: session.loginToken }); client.current = rtc;
      rtc.remoteElement = remoteAudio.current!;
      rtc.on('telnyx.ready', () => { if (mounted.current) { setConnected(true); setConnecting(false); } });
      rtc.on('telnyx.error', () => { if (mounted.current) { setConnected(false); setConnecting(false); toast.error('Headset connection failed. Disconnect and reconnect before dialing.'); } });
      rtc.on('telnyx.socket.close', () => { if (mounted.current) setConnected(false); });
      rtc.on('telnyx.notification', (notification: INotification) => {
        if (notification.type !== 'callUpdate' || !notification.call) return;
        const updated = notification.call as Call;
        if (updated.state === 'ringing') {
          // The backend only rings this credential for a requested CRM attempt.
          if (!currentAttempt.current || updated.options.customHeaders?.find(header => header.name.toLowerCase() === 'x-crm-attempt')?.value !== currentAttempt.current || (call.current && call.current.id !== updated.id)) { updated.hangup(); return; }
          call.current = updated;
          if (mounted.current) setIncoming(true);
        } else if (updated.state === 'active') {
          if (mounted.current) setIncoming(false);
        } else if (['hangup', 'destroy'].includes(updated.state) && call.current?.id === updated.id) {
          call.current = null;
          if (mounted.current) { setIncoming(false); setMuted(false); }
        }
      });
      await rtc.connect();
    } catch (error) {
      client.current?.disconnect(); client.current = null;
      if (mounted.current) { setConnecting(false); toast.error(error instanceof Error ? error.message : 'Could not connect your headset.'); }
    } finally { connectingRef.current = false; }
  }
  function disconnect() {
    if (active) return;
    client.current?.disconnect(); client.current = null; setConnected(false); setConnecting(false);
  }
  async function dial(row = selected, fromQueue = false) {
    if (!row || !row.canCall || !connected || !canCall || (busy && !fromQueue) || currentAttempt.current) return;
    const id = crypto.randomUUID(); currentAttempt.current = id;
    setBusy(true); setSelected(row); setAttemptId(id); setNotes(''); setFollowUp(''); setMuted(false);
    try {
      const result = await request<Attempt>('attempts', { method: 'POST', body: JSON.stringify({ id, leadId: row.id }) });
      queryClient.setQueryData(['calling-attempt', scope, id], result);
      void queryClient.invalidateQueries({ queryKey: ['calling-history', scope] });
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 403, 404, 409, 503].includes(error.status)) {
        currentAttempt.current = null; setAttemptId(null);
      }
      // Network/5xx failures may happen after dialing: retain the id and offer End call.
      toast.error(error instanceof Error ? error.message : 'Call could not be confirmed.');
    } finally { setBusy(false); }
  }
  async function answer() {
    try { await call.current?.answer(); remoteAudio.current?.play().catch(() => toast.error('Tap the audio player to hear the patient.')); }
    catch { toast.error('Could not answer. End the call and reconnect your headset.'); }
  }
  async function stop() {
    if (!attemptId) return;
    setBusy(true);
    try {
      const result = await request<Attempt>(`attempts/${attemptId}/stop`, { method: 'POST' });
      call.current?.hangup(); call.current = null; setIncoming(false);
      queryClient.setQueryData(['calling-attempt', scope, attemptId], result);
      void queryClient.invalidateQueries({ queryKey: ['calling-history', scope] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not confirm the call ended. Try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!attemptId || !terminal(attempt?.status)) return;
    setBusy(true);
    try {
      await request(`attempts/${attemptId}`, { method: 'PATCH', body: JSON.stringify({ outcome, notes, ...(followUp ? { followUpAt: new Date(followUp).toISOString() } : {}) }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['calling-history', scope] }), queryClient.invalidateQueries({ queryKey: ['calling-queue', scope] })]);
      toast.success('Call outcome saved.');
      setAttemptId(null); currentAttempt.current = null;
      if (advance && selected) {
        const index = queue.findIndex(row => row.id === selected.id);
        const next = queue.slice(index + 1).find(row => row.canCall);
        if (next) { setSelected(next); setBusy(false); await dial(next, true); }
        else toast.success('You reached the end of this queue.');
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save call outcome.'); }
    finally { setBusy(false); }
  }
  if (!readAllowed) return <p role="alert">Calling is not enabled for your access profile.</p>;
  return <div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-semibold">Patient calling</h1><p className="text-sm text-muted-foreground">Call your assigned patients in the US and Canada, then continue on WhatsApp.</p></div>
    {statusError && <p role="alert">Could not load calling status. Please try again.</p>}
    {status && !status.ready && <div className="rounded-lg border bg-background p-4"><h2 className="font-semibold">Calling awaits clinic activation</h2><p className="mt-1 text-sm text-muted-foreground">Your Telnyx account, caller number, and secure connection need to be configured before live calls can start.</p>{user?.role === 'SUPER_ADMIN' && <a className="mt-2 inline-block text-sm text-primary underline" href="https://portal.telnyx.com/" target="_blank" rel="noopener noreferrer">Open Telnyx account setup</a>}</div>}
    {status && !status.canPlaceCalls && <p className="text-sm text-muted-foreground">Your profile can review calling activity. Calls are placed by authorized sales or reception staff.</p>}
    {status?.canPlaceCalls && <div className="flex flex-wrap items-center gap-3"><Button onClick={connect} disabled={!canCall || connected || connecting || !!client.current}>{connecting ? 'Connecting…' : connected ? 'Headset connected' : 'Connect headset'}</Button><Button variant="outline" onClick={disconnect} disabled={active || (!connected && !client.current)}>Disconnect headset</Button>{status.callerNumber && <span className="text-sm text-muted-foreground">Caller number: {status.callerNumber}</span>}</div>}
    <audio ref={remoteAudio} autoPlay controls className="h-8 w-full max-w-sm" aria-label="Patient call audio" />
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border bg-background p-4"><h2 className="mb-3 font-semibold">Assigned call queue</h2><Label htmlFor="call-search">Search patients</Label><Input id="call-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or phone number" />
        <p className="my-2 text-xs text-muted-foreground">Up to 500 recent active records are searched. Only valid US/Canada phone numbers appear.</p>
        {queueError && <p role="alert">Could not load patients.</p>}{isLoading && <p role="status">Loading patients…</p>}
        {!isLoading && !queueError && !queue.length && <p className="py-4 text-sm text-muted-foreground">No eligible assigned patients found. Check the patient’s phone number and country.</p>}
        <ul className="max-h-[28rem] space-y-2 overflow-auto">{queue.map(row => <li key={row.id}><button className={`w-full rounded border p-3 text-left ${selected?.id === row.id ? 'border-primary bg-primary/5' : ''}`} disabled={active} onClick={() => { setSelected(row); setAttemptId(null); setNotes(''); setFollowUp(''); }}><span className="block font-medium">{row.name}</span><span className="text-sm text-muted-foreground">{row.phone}{row.lastCall ? ` · Last call: ${row.lastCall.outcome.toLowerCase()}` : ''}</span></button></li>)}</ul>
      </section>
      <section className="space-y-4 rounded-lg border bg-background p-4"><h2 className="font-semibold">{selected?.name ?? 'Select a patient'}</h2>{selected && <p>{selected.phone}</p>}
        {status?.canPlaceCalls && <div className="flex flex-wrap gap-2"><Button onClick={() => dial()} disabled={!canCall || !connected || !selected?.canCall || active || busy}><Phone className="mr-2 h-4 w-4" />Call patient</Button>{incoming && <Button onClick={answer} disabled={busy}>Answer headset</Button>}{active && <><Button variant="destructive" onClick={stop} disabled={busy}><PhoneOff className="mr-2 h-4 w-4" />End call</Button><Button variant="outline" disabled={!call.current || incoming} onClick={() => { if (muted) call.current?.unmuteAudio(); else call.current?.muteAudio(); setMuted(!muted); }}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? 'Unmute' : 'Mute'}</Button></>}</div>}
        {attemptId && <p role="status">{labels[attempt?.status ?? 'STAFF_RINGING'] ?? 'Checking call status…'}</p>}{attempt?.failureReason && <p role="alert" className="text-sm">{attempt.failureReason}</p>}{attemptError && <p role="alert" className="text-sm">Call status is unavailable. End the call before trying another patient.</p>}
        {selected && <a className="inline-block text-sm text-primary underline" href={`https://wa.me/${selected.phone.slice(1)}`} target="_blank" rel="noopener noreferrer">Open WhatsApp chat</a>}
        {status?.canPlaceCalls && terminal(attempt?.status) && <div className="space-y-3"><div><Label htmlFor="call-outcome">Call outcome</Label><select id="call-outcome" className="mt-1 w-full rounded border bg-background p-2" value={outcome} onChange={event => setOutcome(event.target.value)}>{['ANSWERED', 'MISSED', 'VOICEMAIL', 'BUSY', 'FAILED'].map(value => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></div><div><Label htmlFor="call-notes">Notes</Label><textarea id="call-notes" className="mt-1 min-h-24 w-full rounded border bg-background p-2" maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></div><div><Label htmlFor="call-follow-up">Follow-up date (optional)</Label><Input id="call-follow-up" type="datetime-local" value={followUp} onChange={event => setFollowUp(event.target.value)} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={advance} onChange={event => setAdvance(event.target.checked)} />Call next patient after saving</label><Button onClick={save} disabled={busy}>Save call outcome</Button></div>}
      </section>
    </div>
    <section className="rounded-lg border bg-background p-4"><h2 className="mb-3 font-semibold">Recent call activity</h2>{!history.length && <p className="text-sm text-muted-foreground">No calls recorded yet.</p>}<ul className="space-y-2">{history.map(row => <li key={row.id} className="border-b py-2 text-sm"><span>{row.phoneNumber} · {labels[row.status] ?? row.status}</span>{row.callLog && <span> · {row.callLog.outcome.toLowerCase()} · {row.callLog.durationSeconds}s</span>}{row.callLog?.notes && <p className="text-muted-foreground">{row.callLog.notes}</p>}</li>)}</ul></section>
  </div>;
}
