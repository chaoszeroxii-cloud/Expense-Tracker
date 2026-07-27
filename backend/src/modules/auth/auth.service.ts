import {
  Injectable, ConflictException, UnauthorizedException, BadRequestException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import axios from 'axios'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { Allocation } from '../allocations/allocation.entity'
import { SpendingPlanService } from '../budgets/spending-plan.service'
import {
  RegisterDto, LoginDto, UpdateProfileDto, GoogleVerifyDto, FacebookVerifyDto,
  ChangePasswordDto, UpdatePreferencesDto, CompleteOnboardingDto,
} from './auth.dto'

const SALT_ROUNDS = 12

export const DEFAULT_WALLETS = [
  { key: 'emergency',  name: 'เงินสำรองฉุกเฉิน', nameEn: 'Emergency Fund',    icon: 'bank',       color: '#f59e0b', pct: 10 },
  { key: 'fixed',      name: 'ค่าใช้จ่ายคงที่',   nameEn: 'Fixed Expenses',    icon: 'housing',    color: '#3b82f6', pct: 30 },
  { key: 'daily',      name: 'ค่าใช้จ่ายประจำวัน', nameEn: 'Daily Expenses',   icon: 'food',       color: '#10b981', pct: 20 },
  { key: 'savings',    name: 'เป้าหมายการออม',     nameEn: 'Savings Goal',     icon: 'target',     color: '#6366f1', pct: 10 },
  { key: 'investment', name: 'การลงทุน',           nameEn: 'Investment',        icon: 'investment', color: '#06b6d4', pct: 15 },
  { key: 'personal',   name: 'ส่วนตัว/บันเทิง',   nameEn: 'Personal / Fun',   icon: 'party',      color: '#ec4899', pct: 10 },
  { key: 'health',     name: 'สุขภาพ/ประกัน',     nameEn: 'Health / Insurance', icon: 'medical',  color: '#ef4444', pct: 5  },
]

// Seeded once per account. Category names are user data — they are stored in the
// language the account was created in and are renameable afterwards, so a Thai
// account must not start life with an English category list.
// The first four expense entries double as the Quick Add starter set for users
// with no history yet, so keep the everyday ones at the top.
const DEFAULT_CATEGORIES = [
  { nameEn: 'Food & Drink',  nameTh: 'อาหารและเครื่องดื่ม', icon: 'food',          color: '#f97316', type: 'expense' },
  { nameEn: 'Transport',     nameTh: 'เดินทาง',              icon: 'transport',     color: '#3b82f6', type: 'expense' },
  { nameEn: 'Shopping',      nameTh: 'ช้อปปิ้ง',             icon: 'shopping',      color: '#a855f7', type: 'expense' },
  { nameEn: 'Utilities',     nameTh: 'บิล/ค่าน้ำค่าไฟ',      icon: 'utilities',     color: '#eab308', type: 'expense' },
  { nameEn: 'Health',        nameTh: 'สุขภาพ',               icon: 'health',        color: '#ef4444', type: 'expense' },
  { nameEn: 'Entertainment', nameTh: 'บันเทิง',              icon: 'entertainment', color: '#ec4899', type: 'expense' },
  { nameEn: 'Housing',       nameTh: 'ที่อยู่อาศัย',          icon: 'housing',       color: '#14b8a6', type: 'expense' },
  { nameEn: 'Education',     nameTh: 'การศึกษา',             icon: 'education',     color: '#6366f1', type: 'expense' },
  { nameEn: 'Other',         nameTh: 'อื่นๆ',                icon: 'other',         color: '#94a3b8', type: 'expense' },
  { nameEn: 'Salary',        nameTh: 'เงินเดือน',            icon: 'salary',        color: '#22c55e', type: 'income'  },
  { nameEn: 'Freelance',     nameTh: 'งานฟรีแลนซ์',          icon: 'freelance',     color: '#10b981', type: 'income'  },
  { nameEn: 'Investment',    nameTh: 'ผลตอบแทนการลงทุน',     icon: 'investment',    color: '#06b6d4', type: 'income'  },
  { nameEn: 'Other Income',  nameTh: 'รายรับอื่นๆ',          icon: 'otherincome',   color: '#84cc16', type: 'income'  },
] as const

@Injectable()
export class AuthService {

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,

    @InjectRepository(Category)
    private readonly categories: Repository<Category>,

    @InjectRepository(Allocation)
    private readonly allocations: Repository<Allocation>,

    private readonly jwt: JwtService,

    private readonly spendingPlans: SpendingPlanService,
  ) {}

  // ── Register ────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.users.findOne({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already registered')

    const hash = await bcrypt.hash(dto.password, SALT_ROUNDS)
    const user = await this.users.save(
      this.users.create({ email: dto.email, name: dto.name, passwordHash: hash }),
    )

    await this.seedCategories(user.id, dto.lang ?? 'th')

    return this.signToken(user)
  }

  /** Seeds the starter category list in the account's language. */
  private async seedCategories(userId: string, lang: 'th' | 'en') {
    await this.categories.save(
      DEFAULT_CATEGORIES.map(c =>
        this.categories.create({
          name:  lang === 'en' ? c.nameEn : c.nameTh,
          icon:  c.icon,
          color: c.color,
          type:  c.type,
          userId,
          isDefault: true,
        }),
      ),
    )
  }

  // ── Login ───────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    if (!user.passwordHash) throw new UnauthorizedException('Please sign in with Google or Facebook')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.signToken(user)
  }

  // ── Google verify ────────────────────────────────────────────
  async googleVerify(dto: GoogleVerifyDto) {
    let googleProfile: { sub: string; email?: string; email_verified?: boolean; name: string }
    try {
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${dto.token}` },
      })
      googleProfile = data
    } catch {
      throw new UnauthorizedException('Invalid Google token')
    }

    // Ensure the access token was actually issued for *our* app, otherwise a
    // token minted by any other Google app could be replayed here.
    await this.assertGoogleAudience(dto.token)

    // Only a Google-verified email may be used to link/create an account.
    const providerEmail =
      googleProfile.email && googleProfile.email_verified ? googleProfile.email : undefined

    return this.resolveSocialLogin({
      providerKey: 'googleId',
      providerId: googleProfile.sub,
      providerEmail,
      clientEmail: dto.email,
      name: googleProfile.name,
      authProvider: 'google',
      lang: dto.lang,
    })
  }

  // ── Facebook verify ──────────────────────────────────────────
  async facebookVerify(dto: FacebookVerifyDto) {
    // Verify the token belongs to our Facebook app before trusting it.
    await this.assertFacebookAppToken(dto.accessToken)

    let fbProfile: { id: string; email?: string; name: string }
    try {
      const { data } = await axios.get('https://graph.facebook.com/me', {
        params: { fields: 'id,name,email', access_token: dto.accessToken },
      })
      fbProfile = data
    } catch {
      throw new UnauthorizedException('Invalid Facebook token')
    }

    // Facebook only returns the email when the user granted the permission,
    // and it is the account's verified email — safe to link on.
    return this.resolveSocialLogin({
      providerKey: 'facebookId',
      providerId: fbProfile.id,
      providerEmail: fbProfile.email,
      clientEmail: dto.email,
      name: fbProfile.name,
      authProvider: 'facebook',
      lang: dto.lang,
    })
  }

  // ── Social login shared logic ────────────────────────────────
  // Auto-linking to an existing account only ever happens on a *provider
  // verified* email. A client-supplied email (typed into the modal) is never
  // trusted for linking — it can only seed a brand-new account — which closes
  // the account-takeover vector.
  private async resolveSocialLogin(params: {
    providerKey: 'googleId' | 'facebookId'
    providerId: string
    providerEmail?: string
    clientEmail?: string
    name: string
    authProvider: 'google' | 'facebook'
    lang?: 'th' | 'en'
  }) {
    const { providerKey, providerId, providerEmail, clientEmail, name, authProvider } = params
    const lang = params.lang ?? 'th'

    // 1. Returning social user — matched by provider id, always safe.
    const existingByProvider = await this.users.findOne({ where: { [providerKey]: providerId } as any })
    if (existingByProvider) return this.signToken(existingByProvider)

    // 2. Provider gave us a verified email → safe to link or create.
    if (providerEmail) {
      const existingByEmail = await this.users.findOne({ where: { email: providerEmail } })
      if (existingByEmail) {
        await this.users.update(existingByEmail.id, { [providerKey]: providerId } as any)
        existingByEmail[providerKey] = providerId
        return this.signToken(existingByEmail)
      }
      return this.createSocialUser(providerEmail, name, authProvider, providerKey, providerId, lang)
    }

    // 3. No verified email from the provider — ask the client for one.
    if (!clientEmail) return { requiresEmail: true, name }

    // Client-supplied email is unverified: only allowed to create a *new*
    // account. If one already exists we refuse to link (prevents takeover).
    const clash = await this.users.findOne({ where: { email: clientEmail } })
    if (clash) {
      throw new ConflictException('An account with this email already exists. Please sign in with your password.')
    }
    return this.createSocialUser(clientEmail, name, authProvider, providerKey, providerId, lang)
  }

  private async createSocialUser(
    email: string,
    name: string,
    authProvider: 'google' | 'facebook',
    providerKey: 'googleId' | 'facebookId',
    providerId: string,
    lang: 'th' | 'en' = 'th',
  ) {
    const partial: Partial<User> = { email, name, authProvider }
    if (providerKey === 'googleId') partial.googleId = providerId
    else partial.facebookId = providerId
    const newUser = await this.users.save(this.users.create(partial as User))
    await this.seedCategories(newUser.id, lang)
    return this.signToken(newUser)
  }

  /** Confirm a Google access token's audience matches our OAuth client id. */
  private async assertGoogleAudience(accessToken: string) {
    const expectedAud = process.env.GOOGLE_CLIENT_ID
    if (!expectedAud) return // not configured (e.g. local dev) — skip
    try {
      const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { access_token: accessToken },
      })
      const aud = data.aud || data.azp
      if (aud !== expectedAud) throw new UnauthorizedException('Google token audience mismatch')
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      throw new UnauthorizedException('Invalid Google token')
    }
  }

  /** Confirm a Facebook token was issued for our app (debug_token). */
  private async assertFacebookAppToken(accessToken: string) {
    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET
    if (!appId || !appSecret) return // not configured (e.g. local dev) — skip
    try {
      const { data } = await axios.get('https://graph.facebook.com/debug_token', {
        params: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
      })
      const info = data?.data
      if (!info?.is_valid || String(info.app_id) !== String(appId)) {
        throw new UnauthorizedException('Facebook token was not issued for this app')
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      throw new UnauthorizedException('Invalid Facebook token')
    }
  }

  // ── Update profile ──────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.users.update(userId, {
      name: dto.name,
      ...(dto.expectedMonthlyIncome !== undefined ? { expectedMonthlyIncome: dto.expectedMonthlyIncome } : {}),
    })
    const user = await this.users.findOne({ where: { id: userId } })
    return user ? this.toProfile(user) : null
  }

  // ── Preferences ─────────────────────────────────────────────
  // Only fields actually present in the request are written, so the client can
  // change one setting without having to echo back the rest of the user's state.
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const patch: Partial<User> = {}

    if (dto.trackingMode !== undefined) patch.trackingMode = dto.trackingMode
    if (dto.timezone !== undefined)     patch.timezone = this.assertTimezone(dto.timezone)
    if (dto.workHoursPerDay !== undefined)  patch.workHoursPerDay = dto.workHoursPerDay
    if (dto.workDaysPerMonth !== undefined) patch.workDaysPerMonth = dto.workDaysPerMonth
    if (dto.showWorkTime !== undefined)     patch.showWorkTime = dto.showWorkTime
    if (dto.advancedMode !== undefined)     patch.advancedMode = dto.advancedMode
    if (dto.remindAt !== undefined)         patch.remindAt = dto.remindAt
    if (dto.expectedMonthlyIncome !== undefined) patch.expectedMonthlyIncome = dto.expectedMonthlyIncome

    // An explicit null clears the plan. `undefined` (absent) leaves it alone —
    // these must not collapse into the same thing.
    if (dto.monthlySpendingLimit !== undefined) {
      patch.monthlySpendingLimit = dto.monthlySpendingLimit
    }

    // Switching to track-only drops the limit rather than keeping a stale number
    // that would reappear if the user switched back weeks later.
    if (dto.trackingMode === 'track_only' && dto.monthlySpendingLimit === undefined) {
      patch.monthlySpendingLimit = null
    }

    if (Object.keys(patch).length > 0) await this.users.update(userId, patch)

    const user = await this.users.findOne({ where: { id: userId } })
    return user ? this.toProfile(user) : null
  }

  /** Reject a timezone Intl cannot resolve — otherwise the daily brief silently drifts. */
  private assertTimezone(tz: string): string {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz })
      return tz
    } catch {
      throw new BadRequestException(`Unknown timezone: ${tz}`)
    }
  }

  // ── Me ──────────────────────────────────────────────────────
  me(user: User) {
    return this.toProfile(user)
  }

  // ── Change Password ──────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    if (user.passwordHash) {
      if (!dto.currentPassword) throw new BadRequestException('กรุณากรอกรหัสผ่านปัจจุบัน')
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash)
      if (!valid) throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง')
    }

    const hash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS)
    const nextVersion = (user.tokenVersion ?? 0) + 1
    // Bump tokenVersion to revoke every other outstanding session, then hand
    // back a fresh token so *this* session (the one that just re-authed) stays.
    await this.users.update(userId, { passwordHash: hash, tokenVersion: nextVersion })
    const refreshed = { ...user, passwordHash: hash, tokenVersion: nextVersion } as User
    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ', ...this.signToken(refreshed) }
  }

  // ── Onboarding ──────────────────────────────────────────────
  //
  // Sets up the one thing the daily loop needs — a spending plan — and nothing else.
  //
  // It used to create up to seven envelope wallets, each at a zero balance and with no
  // category links, while the UI advertised a "recommended %" this method never applied.
  // That was pure setup cost at the moment motivation is weakest, and the envelope
  // system still did nothing until the user went to Wallets and linked categories by
  // hand. Wallets are now opt-in via advanced mode instead.
  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    const patch: Partial<User> = {
      onboardingCompleted: true,
      trackingMode: dto.trackingMode,
      // Track-only means the user declined to commit to a number; storing one anyway
      // would make the home screen claim a plan they never set.
      monthlySpendingLimit: dto.trackingMode === 'plan' ? (dto.monthlySpendingLimit ?? null) : null,
    }
    if (dto.timezone) patch.timezone = this.assertTimezone(dto.timezone)

    await this.users.update(userId, patch)

    // The plan also has to land in the month-scoped table, or there is nothing for the
    // following month to inherit — the legacy column carries no month and so cannot be
    // carried forward. Written after the user update so it picks up the new timezone.
    if (patch.monthlySpendingLimit) {
      const month = await this.spendingPlans.currentMonth(userId)
      await this.spendingPlans.setTotal(userId, month, patch.monthlySpendingLimit)
    }

    const refreshed = await this.users.findOne({ where: { id: userId } })
    return { success: true, user: refreshed ? this.toProfile(refreshed) : null }
  }

  /**
   * Creates the starter envelope wallets — now an explicit opt-in from advanced mode
   * rather than something onboarding does on the user's behalf.
   */
  async createStarterWallets(userId: string, walletKeys: string[], lang: 'th' | 'en' = 'th') {
    const wallets = DEFAULT_WALLETS.filter((w) => walletKeys.includes(w.key))
    if (wallets.length === 0) throw new BadRequestException('Pick at least one wallet')

    const existing = await this.allocations.count({ where: { userId } })
    if (existing > 0) throw new ConflictException('Wallets already exist for this account')

    const created = await this.allocations.save(
      wallets.map((w) => this.allocations.create({
        userId,
        name: lang === 'en' ? w.nameEn : w.name,
        icon: w.icon,
        color: w.color,
      })),
    )
    await this.users.update(userId, { advancedMode: true })
    return { success: true, created: created.length }
  }

  // ── Forgot Password ─────────────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.users.findOne({ where: { email } })
    if (user) {
      const token = randomBytes(32).toString('hex')
      const expiry = new Date(Date.now() + 30 * 60 * 1000)
      await this.users.update(user.id, { resetToken: token, resetTokenExpiry: expiry })
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`
      this.sendResetEmail(email, resetUrl).catch((err: unknown) => console.error('[mailer] failed to send reset email:', err))
    }
    return { message: 'เราได้ส่งลิงก์ไปยังบัญชีอีเมลของคุณแล้ว' }
  }

  // ── Reset Password ───────────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const user = await this.users.findOne({ where: { resetToken: token } })
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('ลิงก์หมดอายุหรือไม่ถูกต้อง')
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    // Invalidate every existing session (including any attacker's) on reset.
    await this.users.update(user.id, {
      passwordHash: hash,
      resetToken: null,
      resetTokenExpiry: null,
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    })
    return { message: 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว' }
  }

  // ── Helpers ─────────────────────────────────────────────────
  private async sendResetEmail(to: string, resetUrl: string) {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'MoneyFlow', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject: 'ตั้งรหัสผ่านใหม่ - MoneyFlow',
        htmlContent: `<!DOCTYPE html><html lang="th"><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">MoneyFlow</h1></div><div style="padding:40px;"><h2 style="color:#1e293b;font-size:20px;font-weight:700;margin:0 0 16px;">ตั้งรหัสผ่านใหม่</h2><p style="color:#64748b;margin:0 0 8px;line-height:1.6;">เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี <strong style="color:#1e293b;">${to}</strong></p><p style="color:#64748b;margin:0 0 28px;line-height:1.6;">คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์จะหมดอายุใน <strong style="color:#1e293b;">30 นาที</strong></p><div style="text-align:center;margin-bottom:32px;"><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">ตั้งรหัสผ่านใหม่ →</a></div><div style="border-top:1px solid #e2e8f0;padding-top:24px;"><p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">ถ้าคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณจะไม่มีการเปลี่ยนแปลง</p></div></div></div></body></html>`,
      },
      { headers: { 'api-key': process.env.BREVO_API_KEY } },
    )
  }

  // Explicit allow-list — never spread the raw entity, which would leak
  // passwordHash, resetToken, googleId/facebookId and tokenVersion.
  private toProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currency: user.currency,
      role: user.role,
      authProvider: user.authProvider,
      onboardingCompleted: user.onboardingCompleted,
      expectedMonthlyIncome: user.expectedMonthlyIncome,
      createdAt: user.createdAt,
      hasPassword: user.passwordHash != null,
      // Spending plan. `monthlySpendingLimit: null` means no plan — not a limit of 0.
      trackingMode: user.trackingMode,
      monthlySpendingLimit: user.monthlySpendingLimit,
      timezone: user.timezone,
      // Work-time lens
      workHoursPerDay: Number(user.workHoursPerDay),
      workDaysPerMonth: user.workDaysPerMonth,
      showWorkTime: user.showWorkTime,
      // Reveals wallets, loans, investments and tax
      advancedMode: user.advancedMode,
      // Daily reminder
      pushEnabled: user.pushEnabled,
      remindAt: user.remindAt,
    }
  }

  private signToken(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, tv: user.tokenVersion ?? 0 }),
      user: this.toProfile(user),
    }
  }
}
