import {
  IsString,
  Length,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsUUID,
  IsDateString,
  Matches,
  IsOptional,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class BillDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  name: string
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999.99)
  @Type(() => Number)
  amount: number
  @IsUUID() categoryId: string
  @IsInt() @Min(1) @Max(31) @Type(() => Number) dueDay: number
}

export class GoalDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  name: string
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999.99)
  @Type(() => Number)
  targetAmount: number
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  @Type(() => Number)
  savedAmount: number
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate: string
}

export class PayBillDto {
  /** Optional link to an expense already recorded. Prevents paying the same real bill twice. */
  @IsOptional() @IsUUID() expenseId?: string
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string
}
