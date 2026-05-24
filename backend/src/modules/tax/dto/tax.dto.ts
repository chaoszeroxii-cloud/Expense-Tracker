import { IsString, IsNumber, IsOptional, IsPositive, Min, Max, MaxLength } from 'class-validator'

export class UpsertTaxDeductionDto {
  @IsNumber()
  @Min(2020)
  @Max(2100)
  taxYear: number

  @IsString()
  @MaxLength(50)
  type: string

  @IsString()
  @MaxLength(200)
  name: string

  @IsNumber()
  @Min(0)
  amount: number

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxAmount?: number

  @IsOptional()
  @IsString()
  note?: string
}

export class TaxCalculationDto {
  @IsNumber()
  @IsPositive()
  annualIncome: number

  @IsNumber()
  @Min(2020)
  taxYear: number
}
