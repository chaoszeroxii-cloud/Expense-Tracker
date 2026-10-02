import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class TemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string
  @IsUUID() categoryId: string
  @IsIn(['expense', 'income']) type: 'expense' | 'income'
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amount: number
  @IsOptional() @IsString() @MaxLength(500) note?: string
}
export class CaptureRowDto {
  @IsUUID() clientKey: string
  @IsUUID() categoryId: string
  @IsIn(['expense', 'income']) type: 'expense' | 'income'
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amount: number
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
  @IsOptional() @IsBoolean() allowDuplicate?: boolean
}
export class CaptureBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CaptureRowDto)
  rows: CaptureRowDto[]
}
