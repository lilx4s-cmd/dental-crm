import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsEnum, IsDateString } from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'INSTALLMENT', 'ONLINE', 'OTHER'] as const;

export class RecordPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PAYMENT_METHODS) method: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
