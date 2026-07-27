import {
  IsEmail, IsString, IsOptional, MinLength, MaxLength,
  IsNumber, Min, Max, IsIn, IsBoolean, IsInt, Matches,
} from 'class-validator'
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

  // Decides which language the starter categories are seeded in. They are user
  // data from that point on, so getting it right at creation matters.
  @IsOptional()
  @IsIn(['th', 'en'])
  lang?: 'th' | 'en'
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

  @IsOptional()
  @IsIn(['th', 'en'])
  lang?: 'th' | 'en'
}

export class FacebookVerifyDto {
  @IsString()
  accessToken: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsIn(['th', 'en'])
  lang?: 'th' | 'en'
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

/**
 * Behavioural preferences, kept apart from identity (UpdateProfileDto) so the UI can
 * change one without resending the other.
 *
 * `monthlySpendingLimit` is deliberately nullable: `null` means "no plan", which is a
 * different statement from a limit of 0 ("you may spend nothing"). Callers must be able
 * to clear a plan, so the field accepts an explicit null.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['plan', 'track_only'])
  trackingMode?: 'plan' | 'track_only'

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Monthly limit must be greater than 0' })
  @Type(() => Number)
  monthlySpendingLimit?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(24)
  @Type(() => Number)
  workHoursPerDay?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  workDaysPerMonth?: number

  @IsOptional()
  @IsBoolean()
  showWorkTime?: boolean

  @IsOptional()
  @IsBoolean()
  advancedMode?: boolean

  /** `HH:MM` in the user's own timezone; when the daily reminder fires. */
  @IsOptional()
  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'remindAt must be HH:MM' })
  remindAt?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  expectedMonthlyIncome?: number
}

export class CompleteOnboardingDto {
  @IsIn(['plan', 'track_only'])
  trackingMode: 'plan' | 'track_only'

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Monthly limit must be greater than 0' })
  @Type(() => Number)
  monthlySpendingLimit?: number

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string

  @IsOptional()
  @IsIn(['th', 'en'])
  lang?: 'th' | 'en'
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
