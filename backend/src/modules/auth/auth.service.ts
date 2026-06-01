import {
  Injectable, ConflictException, UnauthorizedException, BadRequestException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import * as nodemailer from 'nodemailer'
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
  private readonly mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })

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
    let googleProfile: { sub: string; email?: string; name: string }
    try {
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${dto.token}` },
      })
      googleProfile = data
    } catch {
      throw new UnauthorizedException('Invalid Google token')
    }

    const email = googleProfile.email || dto.email
    if (!email) return { requiresEmail: true, name: googleProfile.name }

    return this.handleSocialLogin({
      providerKey: 'googleId',
      providerId: googleProfile.sub,
      email,
      name: googleProfile.name,
      authProvider: 'google',
    })
  }

  // ── Facebook verify ──────────────────────────────────────────
  async facebookVerify(dto: FacebookVerifyDto) {
    let fbProfile: { id: string; email?: string; name: string }
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/me?fields=id,name,email&access_token=${dto.accessToken}`,
      )
      fbProfile = data
    } catch {
      throw new UnauthorizedException('Invalid Facebook token')
    }

    const email = fbProfile.email || dto.email
    if (!email) return { requiresEmail: true, name: fbProfile.name }

    return this.handleSocialLogin({
      providerKey: 'facebookId',
      providerId: fbProfile.id,
      email,
      name: fbProfile.name,
      authProvider: 'facebook',
    })
  }

  // ── Social login shared logic ────────────────────────────────
  private async handleSocialLogin(params: {
    providerKey: 'googleId' | 'facebookId'
    providerId: string
    email: string
    name: string
    authProvider: 'google' | 'facebook'
  }) {
    const { providerKey, providerId, email, name, authProvider } = params

    // 1. Returning social user
    let user = await this.users.findOne({ where: { [providerKey]: providerId } as any })
    if (user) return this.signToken(user)

    // 2. Auto-link: email already exists → link social ID to existing account
    user = await this.users.findOne({ where: { email } })
    if (user) {
      await this.users.update(user.id, { [providerKey]: providerId } as any)
      user[providerKey] = providerId
      return this.signToken(user)
    }

    // 3. Brand new user
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

  // ── Update profile ──────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.users.update(userId, { name: dto.name })
    return this.users.findOne({ where: { id: userId } })
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
    await this.users.update(userId, { passwordHash: hash })
    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ' }
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
      this.mailer.sendMail({
        from: `"MoneyFlow" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'ตั้งรหัสผ่านใหม่ - MoneyFlow',
        html: `<!DOCTYPE html><html lang="th"><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">💸 MoneyFlow</h1></div><div style="padding:40px;"><h2 style="color:#1e293b;font-size:20px;font-weight:700;margin:0 0 16px;">ตั้งรหัสผ่านใหม่</h2><p style="color:#64748b;margin:0 0 8px;line-height:1.6;">เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี <strong style="color:#1e293b;">${email}</strong></p><p style="color:#64748b;margin:0 0 28px;line-height:1.6;">คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์จะหมดอายุใน <strong style="color:#1e293b;">30 นาที</strong></p><div style="text-align:center;margin-bottom:32px;"><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">ตั้งรหัสผ่านใหม่ →</a></div><div style="border-top:1px solid #e2e8f0;padding-top:24px;"><p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">ถ้าคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณจะไม่มีการเปลี่ยนแปลง</p></div></div></div></body></html>`,
      }).catch(err => console.error('[mailer] failed to send reset email:', err))
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
    await this.users.update(user.id, { passwordHash: hash, resetToken: null, resetTokenExpiry: null })
    return { message: 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว' }
  }

  // ── Helpers ─────────────────────────────────────────────────
  private toProfile(user: User) {
    const { passwordHash, ...rest } = user as any
    return { ...rest, hasPassword: passwordHash !== null }
  }

  private signToken(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user: this.toProfile(user),
    }
  }
}
