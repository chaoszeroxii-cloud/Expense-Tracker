import { IsUUID, IsNumber, IsPositive, IsString, Matches, IsOptional } from 'class-validator'

export class UpsertBudgetDto {
  @IsUUID()
  categoryId: string

  @IsNumber()
  @IsPositive()
  amount: number

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string
}

export class BudgetQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string
}
