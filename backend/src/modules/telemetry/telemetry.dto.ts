import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * The complete set of events the client may record. A closed list rather than a free
 * string: the endpoint is authenticated but client-side, so anything it accepts is
 * effectively user-controlled, and an open `name` column becomes a place to stash text.
 */
export const PRODUCT_EVENTS = [
  'onboarding_started',
  'onboarding_completed',
  'onboarding_skipped_plan',
  'add_opened',
  'expense_created',
  'add_failed',
  'daily_brief_viewed',
  'quick_capture_used',
  'undo_used',
  'plan_set',
  'plan_changed',
  'work_time_toggled',
  'ai_analysis_requested',
] as const

export type ProductEventName = (typeof PRODUCT_EVENTS)[number]

export class ProductEventDto {
  @IsIn(PRODUCT_EVENTS as unknown as string[])
  name: ProductEventName

  /**
   * Elapsed time for the action, e.g. `add_opened` → `expense_created`. This is the
   * metric behind the sub-10-second target, so it is the one number worth collecting.
   * Capped at an hour: anything longer is a backgrounded tab, not a measurement.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  @Type(() => Number)
  durationMs?: number

  @IsOptional()
  @IsIn(['web', 'pwa', 'ios', 'android'])
  platform?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string

  /** `YYYY-MM-DD` in the user's local calendar. Falls back to their profile timezone. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  localDate?: string
}
