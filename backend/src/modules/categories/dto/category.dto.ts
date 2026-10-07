import { IsString, IsIn, IsOptional, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { MEMO_CODE_PATTERN, normalizeMemoCode } from '../../../common/memo-code.util';

class MemoCodeDto {
  @IsOptional()
  // Read the raw value: implicit conversion must not turn JSON numbers into codes.
  @Transform(({ obj }) => normalizeMemoCode(obj.memoCode))
  @IsString()
  @MaxLength(20)
  @Matches(MEMO_CODE_PATTERN, { message: 'memo_code_invalid' })
  memoCode?: string | null;
}

export class CreateCategoryDto extends MemoCodeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(({ obj }) => obj.icon)
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (#RRGGBB)' })
  color?: string;

  @IsIn(['expense', 'income'])
  type: 'expense' | 'income';
}

// ← แยกออกมา ไม่ extends แล้ว เพราะ type ไม่ควร required ตอน update
export class UpdateCategoryDto extends MemoCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ obj }) => obj.icon)
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (#RRGGBB)' })
  color?: string;
}
