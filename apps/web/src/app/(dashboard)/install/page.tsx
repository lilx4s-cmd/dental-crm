'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smartphone, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallPage() {
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const mode = window.matchMedia('(display-mode: standalone)');
    const check = () => setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    check();
    mode.addEventListener('change', check);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    return () => {
      mode.removeEventListener('change', check);
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/my-day`);
      setNotice('CRM address copied. Paste it into Safari’s address bar.');
    } catch { setNotice('Use the CRM address shown in your browser’s address bar.'); }
  }

  return <section className="mx-auto max-w-xl space-y-5 rounded-xl border bg-background p-5">
    <h1 className="flex items-center gap-2 text-2xl font-semibold"><Smartphone className="h-6 w-6" /> Install CRM on your phone</h1>
    {installed ? <>
      <p role="status" className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> You are using the installed CRM app.</p>
      <Link href="/notifications" className="inline-flex min-h-11 items-center text-primary underline">Set up phone notifications</Link>
    </> : <>
      <p>Add the CRM icon to your Home Screen so you can open your workspace like an app.</p>
      {ios ? <>
        <h2 className="text-lg font-semibold">iPhone and iPad</h2>
        <ol className="list-decimal space-y-3 pl-5">
          <li>Open this CRM address in <strong>Safari</strong>. If you are inside WhatsApp or another app, copy the address below and paste it into Safari.</li>
          <li>Tap <strong>Share</strong> in Safari. Depending on your Safari layout, first tap the <strong>More</strong> menu.</li>
          <li>Scroll through the Share options and tap <strong>Add to Home Screen</strong>. If it is missing, open <strong>Edit Actions</strong> and add it.</li>
          <li>If shown, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li>
          <li>Open the <strong>Venedik CRM</strong> icon from your Home Screen. Sign in once if asked, then open Notification settings to enable alerts.</li>
        </ol>
        <Button variant="outline" onClick={() => void copyAddress()} className="min-h-11">Copy CRM address for Safari</Button>
      </> : <>
        <h2 className="text-lg font-semibold">Android and Samsung</h2>
        <p>Open the CRM in Chrome or Samsung Internet. Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>, then open the new icon.</p>
        {prompt && <Button className="min-h-11" onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          setNotice(choice.outcome === 'accepted' ? 'Installation requested. Open the new CRM icon when it appears.' : 'You can install later from your browser menu.');
          setPrompt(null);
        }}>Install CRM</Button>}
      </>}
      <p className="text-sm text-muted-foreground">Your existing leads and chats stay in the CRM. Keep an internet connection while using the app.</p>
      <Link href="/notifications" className="inline-flex min-h-11 items-center text-primary underline">Notification settings</Link>
    </>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <Link href="/my-day" className="inline-flex min-h-11 items-center text-primary underline">Back to my workspace</Link>
  </section>;
}
