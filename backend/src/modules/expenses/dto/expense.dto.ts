import {
  IsString, IsNumber, IsIn, IsOptional,
  IsDateString, IsArray, Min, Max, MaxLength, IsUUID,
  Matches, ArrayMaxSize, IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string

  // Must match `CHECK (amount > 0)` on the expenses table. `@Min(0)` let a zero through
  // validation and straight into a constraint violation, which surfaced as an opaque 500.
  // `numeric(12,2)` tops out at 9,999,999,999.99. Without an upper bound a larger
  // value passed validation and died in the driver as a numeric overflow — a 500 for
  // what is plainly a bad request.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  @Max(9_999_999_999.99, { message: 'Amount is too large' })
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
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[]

  @IsDateString()
  occurredAt: string

  /**
   * Idempotency key for a replayed offline capture. Optional: online creates omit it.
   * Sending the same key twice returns the transaction created the first time rather
   * than creating a second one.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientKey?: string
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  @Max(9_999_999_999.99, { message: 'Amount is too large' })
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
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
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

  // Shape-checked, because these reach a date cast in SQL. An unparseable value used
  // to surface as an opaque 500 rather than a 400.
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'year must be YYYY' })
  year?: string

  // Inclusive month range (YYYY-MM). When both are set they take
  // precedence over `month`/`year` and return everything in between.
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'from must be YYYY-MM' })
  from?: string

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'to must be YYYY-MM' })
  to?: string

  // The list was unbounded: an account with years of history returned every row it had
  // in a single response, on a screen that shows one month at a time.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number
}
