import { IsString, IsNumber, IsPositive, IsOptional, IsDateString, MaxLength, IsIn } from 'class-validator'

export class CreateLoanDto {
  @IsString()
  @IsIn(['lent', 'borrowed'])
  direction: 'lent' | 'borrowed'

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
