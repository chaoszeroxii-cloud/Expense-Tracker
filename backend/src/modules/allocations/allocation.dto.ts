import {
  IsString, IsOptional, MaxLength,
  IsArray, IsUUID, Matches,
} from 'class-validator'

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

  // Category IDs to bind
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]
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
}
