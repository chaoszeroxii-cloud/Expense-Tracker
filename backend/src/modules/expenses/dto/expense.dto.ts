import {
  IsString, IsNumber, IsIn, IsOptional,
  IsDateString, IsArray, Min, MaxLength, IsUUID,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount: number

  @IsIn(['expense', 'income'])
  type: 'expense' | 'income'

  // Required when type === 'income' to credit an allocation
  @IsOptional()
  @IsUUID()
  allocationId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsDateString()
  occurredAt: string
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount?: number

  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: 'expense' | 'income'

  @IsOptional()
  @IsUUID()
  allocationId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsDateString()
  occurredAt?: string
}

export class QueryExpenseDto {
  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: 'expense' | 'income'

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsString()
  month?: string

  @IsOptional()
  @IsString()
  year?: string

  // Inclusive month range (YYYY-MM). When both are set they take
  // precedence over `month`/`year` and return everything in between.
  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}
