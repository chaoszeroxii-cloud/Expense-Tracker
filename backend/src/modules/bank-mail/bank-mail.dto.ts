import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class BankMailSettingsDto {
  @Transform(({ obj }) => obj.autoImport) @IsBoolean() autoImport: boolean
  @IsOptional() @IsUUID() expenseCategoryId?: string
  @IsOptional() @IsUUID() incomeCategoryId?: string
  @IsArray() @ArrayMaxSize(20) @ArrayUnique()
  @Matches(/^(ktb|scb|promptpay|other):\d{4}$/, { each: true }) ownAccounts: string[]
}
export class BankMailSaveDto {
  @IsUUID() categoryId: string
  @IsIn(['income', 'expense']) type: 'income' | 'expense'
  @IsOptional() @Transform(({ obj }) => obj.allowDuplicate) @IsBoolean() allowDuplicate?: boolean
}
export class BankMailListDto {
  @IsOptional() @IsIn(['pending', 'saved', 'ignored']) status?: 'pending' | 'saved' | 'ignored'
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset?: number
}
export class BankMailCompleteDto {
  @Matches(/^[\w-]{43}$/) state: string
  @IsString() @Length(1, 4096) code: string
}
