import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Opens a thread with a lead or a patient.
 *
 * Exactly one of the two identifies the contact. `ValidateIf` makes each required only when the
 * other is absent, so an empty body fails with "leadId must be a UUID" rather than being accepted
 * and creating a conversation attached to nobody.
 */
export class StartConversationDto {
  @ValidateIf((o: StartConversationDto) => !o.patientId)
  @IsUUID()
  leadId?: string;

  @ValidateIf((o: StartConversationDto) => !o.leadId)
  @IsUUID()
  patientId?: string;
}
