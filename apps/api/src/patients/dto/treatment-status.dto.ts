import { IsIn } from 'class-validator';
export class TreatmentStatusDto {
  @IsIn(['WORKING', 'FINISHED'])
  status!: 'WORKING' | 'FINISHED';
}
