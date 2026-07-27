import { IsIn, IsOptional, IsString, Matches } from 'class-validator'

/** The phrase the UI asks for. Deliberately not the same for both actions. */
export const RESET_TRANSACTIONS_PHRASE = 'ลบรายการทั้งหมด'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export class ResetTransactionsDto {
  /**
   * Must equal RESET_TRANSACTIONS_PHRASE.
   *
   * Checked on the server as well as in the browser: a guard that only exists in the
   * client is not a guard, and this endpoint destroys data with no way back.
   */
  @IsString()
  confirm: string

  /** Inclusive `YYYY-MM`. Omit both to clear the entire ledger. */
  @IsOptional()
  @IsString()
  @Matches(MONTH, { message: 'from must be YYYY-MM' })
  from?: string

  @IsOptional()
  @IsString()
  @Matches(MONTH, { message: 'to must be YYYY-MM' })
  to?: string
}

export class FactoryResetDto {
  /**
   * Must equal the account's own email address.
   *
   * A different phrase from the transaction reset on purpose: if both said "confirm",
   * muscle memory from the safer action would carry straight into the destructive one.
   * An email cannot be typed by accident.
   */
  @IsString()
  confirm: string

  @IsOptional()
  @IsIn(['th', 'en'])
  lang?: 'th' | 'en'
}
