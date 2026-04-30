import {
  IsString, IsOptional, MaxLength,
  IsArray, IsUUID, Matches, IsNumber, Min,
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

// ── Move unallocated funds into a specific wallet ─────────────
export class MoveMoneyDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  @Type(() => Number)
  amount: number
}