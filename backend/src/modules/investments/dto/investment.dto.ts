import { IsString, IsNumber, IsPositive, IsOptional, IsDateString, IsIn, MaxLength } from 'class-validator'

export class CreateInvestmentDto {
  @IsString()
  @MaxLength(200)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  symbol?: string

  @IsIn(['mutual_fund', 'stock_th', 'stock_us', 'crypto', 'gold', 'other'])
  type: string

  @IsOptional()
  @IsString()
  note?: string
}

export class AddInvestmentTransactionDto {
  @IsIn(['buy', 'sell', 'dividend'])
  type: string

  @IsNumber()
  @IsPositive()
  amount: number

  @IsOptional()
  @IsNumber()
  @IsPositive()
  units?: number

  @IsOptional()
  @IsNumber()
  @IsPositive()
  navPrice?: number

  @IsDateString()
  occurredAt: string

  @IsOptional()
  @IsString()
  note?: string
}
