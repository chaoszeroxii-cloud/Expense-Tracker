import {
  IsString, IsOptional, MaxLength,
  IsArray, IsUUID, Matches, IsNumber, Min,
  ValidateNested, ArrayMinSize, ArrayMaxSize,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateAllocationDto {
  @IsString()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex (#RRGGBB)' })
  color?: string

  // Expense category IDs to bind (drain on expense)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]

  // Income category IDs to bind (credit on income)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  incomeCategoryIds?: string[]
}

export class UpdateAllocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  icon?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  incomeCategoryIds?: string[]
}

/**
 * A wallet's intended share of a month's funding.
 *
 * Saving these moves no money and checks no capacity — a plan has to be writable before
 * the money exists, which the old apply-only flow made impossible whenever the
 * unallocated pool sat at zero.
 */
export class AllocationTargetItemDto {
  @IsUUID()
  allocationId: string

  /** 0 removes the target for this wallet. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  targetAmount: number
}

export class SaveAllocationTargetsDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationTargetItemDto)
  items: AllocationTargetItemDto[]
}

// ── Move unallocated funds into a specific wallet ─────────────
export class MoveMoneyDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  @Type(() => Number)
  amount: number
}

// ── Transfer funds between two wallets ────────────────────────
export class TransferMoneyDto {
  @IsUUID('4')
  targetAllocationId: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  @Type(() => Number)
  amount: number
}

// ── Apply Last Month's Plan: batch-fund every wallet at once ──
export class PlanAmountDto {
  @IsUUID('4')
  allocationId: string

  // 0 allowed — user may choose to skip a wallet this month
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount: number
}

export class ApplyPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlanAmountDto)
  amounts: PlanAmountDto[]
}