import { IsEmail, IsString, IsOptional, MinLength, MaxLength, IsNumber, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class RegisterDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string
}

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  password: string
}

export class GoogleVerifyDto {
  @IsString()
  token: string

  @IsOptional()
  @IsEmail()
  email?: string
}

export class FacebookVerifyDto {
  @IsString()
  accessToken: string

  @IsOptional()
  @IsEmail()
  email?: string
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  expectedMonthlyIncome?: number
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string
}

export class ResetPasswordDto {
  @IsString()
  token: string

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string
}
