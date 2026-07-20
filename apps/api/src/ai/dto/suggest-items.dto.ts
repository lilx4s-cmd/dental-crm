import { IsArray, IsOptional, IsString } from 'class-validator';

export class SuggestItemsDto {
  @IsString()
  diagnosisText!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryNames?: string[];
}
