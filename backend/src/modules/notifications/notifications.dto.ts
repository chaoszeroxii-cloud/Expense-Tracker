import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class PushKeysDto {
  @IsString()
  @MaxLength(255)
  p256dh: string

  @IsString()
  @MaxLength(255)
  auth: string
}

export class PushSubscriptionDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto
}

export class SubscribeDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionDto)
  subscription: PushSubscriptionDto
}

export class UnsubscribeDto {
  /** Omit to remove every device for this account. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  endpoint?: string
}
