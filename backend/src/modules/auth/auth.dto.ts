import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator'

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
