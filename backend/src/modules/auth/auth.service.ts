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
import { RegisterDto, LoginDto, UpdateProfileDto, GoogleVerifyDto, FacebookVerifyDto, ChangePasswordDto } from './auth.dto'

const SALT_ROUNDS = 12

export const DEFAULT_WALLETS = [
  { key: 'emergency',  name: 'เงินสำรองฉุกเฉิน', nameEn: 'Emergency Fund',    icon: '🏦', color: '#f59e0b', pct: 10 },
  { key: 'fixed',      name: 'ค่าใช้จ่ายคงที่',   nameEn: 'Fixed Expenses',    icon: '🏠', color: '#3b82f6', pct: 30 },
  { key: 'daily',      name: 'ค่าใช้จ่ายประจำวัน', nameEn: 'Daily Expenses',   icon: '🍚', color: '#10b981', pct: 20 },
  { key: 'savings',    name: 'เป้าหมายการออม',     nameEn: 'Savings Goal',     icon: '🎯', color: '#6366f1', pct: 10 },
  { key: 'investment', name: 'การลงทุน',           nameEn: 'Investment',        icon: '📈', color: '#06b6d4', pct: 15 },
  { key: 'personal',   name: 'ส่วนตัว/บันเทิง',   nameEn: 'Personal / Fun',   icon: '🎉', color: '#ec4899', pct: 10 },
  { key: 'health',     name: 'สุขภาพ/ประกัน',     nameEn: 'Health / Insurance', icon: '🏥', color: '#ef4444', pct: 5  },
]

const DEFAULT_CATEGORIES = [
  { name: 'Food & Drink',   icon: '🍜', color: '#f97316', type: 'expense' },
  { name: 'Transport',      icon: '🚗', color: '#3b82f6', type: 'expense' },
  { name: 'Shopping',       icon: '🛍️', color: '#a855f7', type: 'expense' },
  { name: 'Health',         icon: '💊', color: '#ef4444', type: 'expense' },
  { name: 'Entertainment',  icon: '🎮', color: '#ec4899', type: 'expense' },
  { name: 'Utilities',      icon: '💡', color: '#eab308', type: 'expense' },
  { name: 'Housing',        icon: '🏠', color: '#14b8a6', type: 'expense' },
  { name: 'Education',      icon: '📚', color: '#6366f1', type: 'expense' },
  { name: 'Other',          icon: '📦', color: '#94a3b8', type: 'expense' },
  { name: 'Salary',         icon: '💼', color: '#22c55e', type: 'income' },
  { name: 'Freelance',      icon: '💻', color: '#10b981', type: 'income' },
  { name: 'Investment',     icon: '📈', color: '#06b6d4', type: 'income' },
  { name: 'Other Income',   icon: '💰', color: '#84cc16', type: 'income' },
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
  ) {}

  // ── Register ────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.users.findOne({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already registered')

    const hash = await bcrypt.hash(dto.password, SALT_ROUNDS)
    const user = await this.users.save(
      this.users.create({ email: dto.email, name: dto.name, passwordHash: hash }),
    )

    // Seed default categories for new user
    await this.categories.save(
      DEFAULT_CATEGORIES.map(c =>
        this.categories.create({ ...c, userId: user.id, isDefault: true }),
      ),
    )

    return this.signToken(user)
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
  }) {
    const { providerKey, providerId, providerEmail, clientEmail, name, authProvider } = params

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
      return this.createSocialUser(providerEmail, name, authProvider, providerKey, providerId)
    }

    // 3. No verified email from the provider — ask the client for one.
    if (!clientEmail) return { requiresEmail: true, name }

    // Client-supplied email is unverified: only allowed to create a *new*
    // account. If one already exists we refuse to link (prevents takeover).
    const clash = await this.users.findOne({ where: { email: clientEmail } })
    if (clash) {
      throw new ConflictException('An account with this email already exists. Please sign in with your password.')
    }
    return this.createSocialUser(clientEmail, name, authProvider, providerKey, providerId)
  }

  private async createSocialUser(
    email: string,
    name: string,
    authProvider: 'google' | 'facebook',
    providerKey: 'googleId' | 'facebookId',
    providerId: string,
  ) {
    const partial: Partial<User> = { email, name, authProvider }
    if (providerKey === 'googleId') partial.googleId = providerId
    else partial.facebookId = providerId
    const newUser = await this.users.save(this.users.create(partial as User))
    await this.categories.save(
      DEFAULT_CATEGORIES.map(c =>
        this.categories.create({ ...c, userId: newUser.id, isDefault: true }),
      ),
    )
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
  async completeOnboarding(userId: string, selectedWalletKeys: string[], lang: 'th' | 'en' = 'th') {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) return

    const wallets = DEFAULT_WALLETS.filter((w) => selectedWalletKeys.includes(w.key))
    if (wallets.length === 0) {
      wallets.push(DEFAULT_WALLETS[0], DEFAULT_WALLETS[2], DEFAULT_WALLETS[3])
    }

    await this.allocations.save(
      wallets.map((w) => this.allocations.create({
        userId,
        name: lang === 'en' ? w.nameEn : w.name,
        icon: w.icon,
        color: w.color,
      })),
    )
    await this.users.update(userId, { onboardingCompleted: true })
    return { success: true, created: wallets.length }
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
        htmlContent: `<!DOCTYPE html><html lang="th"><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">💸 MoneyFlow</h1></div><div style="padding:40px;"><h2 style="color:#1e293b;font-size:20px;font-weight:700;margin:0 0 16px;">ตั้งรหัสผ่านใหม่</h2><p style="color:#64748b;margin:0 0 8px;line-height:1.6;">เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี <strong style="color:#1e293b;">${to}</strong></p><p style="color:#64748b;margin:0 0 28px;line-height:1.6;">คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์จะหมดอายุใน <strong style="color:#1e293b;">30 นาที</strong></p><div style="text-align:center;margin-bottom:32px;"><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">ตั้งรหัสผ่านใหม่ →</a></div><div style="border-top:1px solid #e2e8f0;padding-top:24px;"><p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">ถ้าคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณจะไม่มีการเปลี่ยนแปลง</p></div></div></div></body></html>`,
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
    }
  }

  private signToken(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, tv: user.tokenVersion ?? 0 }),
      user: this.toProfile(user),
    }
  }
}
