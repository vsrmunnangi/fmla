import { IsIn, IsOptional, IsString } from 'class-validator';
import { CATEGORY_KEYS } from '../../common/categories';

export class CreateClaimDto {
  @IsString() claimant!: string;
  @IsString() employer!: string;
  @IsIn(CATEGORY_KEYS) type!: string;
  @IsOptional() @IsString() leaveType?: string;
}
