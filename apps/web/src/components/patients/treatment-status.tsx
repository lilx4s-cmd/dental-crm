'use client';
import { hasPermission } from '@dental-crm/shared';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useTreatmentStatus, type Patient } from '@/hooks/use-patients';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
export function TreatmentStatus({ patient }: { patient: Patient }) {
  const { user } = useAuth();
  const update = useTreatmentStatus(patient.id);
  const finished = patient.treatmentStatus === 'FINISHED';
  const mayEdit =
    !!user &&
    hasPermission(
      user,
      'patients.write',
      ['SUPER_ADMIN', 'CLINIC_MANAGER', 'RECEPTION'].includes(user.role),
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <Badge variant={finished ? 'success' : 'info'}>
        {finished ? 'Treatment finished' : 'Currently working'}
      </Badge>
      <span className="flex-1 text-sm text-muted-foreground">
        {finished
          ? 'This patient appears in Finished patients. Future visits stay visible in Reservations.'
          : 'Mark finished when treatment is complete. Future reservations stay visible.'}
      </span>
      {mayEdit && (
        <Button
          variant="outline"
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(finished ? 'WORKING' : 'FINISHED', {
              onSuccess: () =>
                toast.success(finished ? 'Patient reopened' : 'Treatment marked finished'),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          {update.isPending ? 'Saving…' : finished ? 'Reopen patient' : 'Mark treatment finished'}
        </Button>
      )}
    </div>
  );
}
