import { IsString, IsNumber, IsPositive, IsOptional, IsDateString, MaxLength } from 'class-validator'

export class CreateLoanDto {
  @IsString()
  @MaxLength(100)
  borrower: string

  @IsNumber()
  @IsPositive()
  amount: number

  @IsOptional()
  @IsString()
  note?: string

  @IsDateString()
  lentAt: string

  @IsOptional()
  @IsDateString()
  dueDate?: string
}

export class CreateLoanPaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number

  @IsDateString()
  paidAt: string

  @IsOptional()
  @IsString()
  note?: string
}
