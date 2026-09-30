import { IsBoolean, IsInt, IsNumber, Matches, Max, Min } from 'class-validator'
export class PayCycleDto {
  @IsBoolean() enabled: boolean
  @IsInt() @Min(1) @Max(31) payDay: number
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) budget: number
}
export class ReminderPreferenceDto {
  @IsBoolean() enabled: boolean
  @IsInt() @Min(0) @Max(14) daysBefore: number
}
export class SnoozeBillDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month: string
  @Matches(/^\d{4}-\d{2}-\d{2}$/) until: string
}
