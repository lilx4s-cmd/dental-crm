'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCampaigns, useCreateCampaign } from '@/hooks/use-campaigns';

const PLATFORMS = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'GOOGLE', label: 'Google' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ENDED: 'secondary',
};

const schema = z.object({
  name: z.string().min(1, 'Required'),
  platform: z.string().min(1, 'Required'),
  externalId: z.string().optional(),
  adAccountId: z.string().optional(),
  budget: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

function NewCampaignDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('');
  const createCampaign = useCreateCampaign();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    try {
      await createCampaign.mutateAsync({ ...data } as Parameters<typeof createCampaign.mutateAsync>[0]);
      toast.success('Campaign created');
      reset();
      setPlatform('');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create campaign');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="Summer Implants Campaign" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Platform *</Label>
            <Select value={platform} onValueChange={(v) => { setPlatform(v); setValue('platform', v); }}>
              <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.platform && <p className="text-xs text-destructive">{errors.platform.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ad Account ID</Label>
              <Input {...register('adAccountId')} placeholder="act_123456" />
            </div>
            <div className="space-y-1.5">
              <Label>Campaign ID</Label>
              <Input {...register('externalId')} placeholder="FB Campaign ID" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Budget (USD)</Label>
            <Input type="number" min={0} {...register('budget')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Track Facebook, Instagram and Google ad campaigns</p>
        </div>
        <NewCampaignDialog />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : campaigns?.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No campaigns yet. Create one to start tracking leads from ads.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns?.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{c.name}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[c.status] ?? 'secondary'}>{c.status}</Badge>
                </div>
                <Badge variant="outline" className="w-fit">{c.platform}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Leads</span>
                  <span className="font-semibold">{c._count.leads}</span>
                </div>
                {c.budget != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-semibold">${Number(c.budget).toLocaleString()}</span>
                  </div>
                )}
                {c.startDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start</span>
                    <span>{format(new Date(c.startDate), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
