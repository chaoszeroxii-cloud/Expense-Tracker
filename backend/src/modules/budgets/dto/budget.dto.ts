import {
  IsUUID, IsNumber, IsPositive, IsString, Matches, IsOptional,
  IsArray, ValidateNested, ArrayMaxSize, Min, Max, ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export class BatchBudgetItemDto {
  @IsUUID()
  categoryId: string

  /** 0 removes the budget for this category; the table forbids storing a zero. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  @Type(() => Number)
  amount: number
}

export class BatchBudgetDto {
  @IsString()
  @Matches(MONTH, { message: 'month must be YYYY-MM' })
  month: string

  // Bounded so one request cannot be used to write an unlimited number of rows.
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchBudgetItemDto)
  items: BatchBudgetItemDto[]
}

export class SetPlanTotalDto {
  @IsString()
  @Matches(MONTH, { message: 'month must be YYYY-MM' })
  month: string

  /**
   * `null` clears the plan for that month. 0 is refused by validation and by the table:
   * "no plan" and "spend nothing this month" are different statements and the UI has to
   * be able to tell them apart.
   */
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Monthly total must be greater than 0' })
  @Max(9_999_999_999.99)
  @Type(() => Number)
  totalAmount: number | null
}

export class CopyPreviousDto {
  @IsString()
  @Matches(MONTH, { message: 'month must be YYYY-MM' })
  month: string
}

export class UpsertBudgetDto {
  @IsUUID()
  categoryId: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
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
