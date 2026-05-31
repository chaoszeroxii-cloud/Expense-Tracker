import {
  Injectable, ConflictException, UnauthorizedException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { Allocation } from '../allocations/allocation.entity'
import { RegisterDto, LoginDto, UpdateProfileDto } from './auth.dto'

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

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.signToken(user)
  }

  // ── Update profile ──────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.users.update(userId, { name: dto.name })
    return this.users.findOne({ where: { id: userId } })
  }

  // ── Me ──────────────────────────────────────────────────────
  me(user: User) {
    const { passwordHash: _, ...safe } = user as any
    return safe
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

  // ── Helpers ─────────────────────────────────────────────────
  private signToken(user: User) {
    const { passwordHash: _, ...profile } = user as any
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user: profile,
    }
  }
}
