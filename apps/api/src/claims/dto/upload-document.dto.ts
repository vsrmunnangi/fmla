import { IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsString() type!: string; // WH-380-E | ProviderLetter | ... (§5)
}
