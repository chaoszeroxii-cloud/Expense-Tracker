import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Not } from 'typeorm'
import { User } from '../users/user.entity'

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getStats() {
    const total = await this.users.count()
    const admins = await this.users.count({ where: { role: 'admin' } })
    const sinceLastMonth = new Date()
    sinceLastMonth.setDate(1)
    sinceLastMonth.setMonth(sinceLastMonth.getMonth() - 1)
    const newThisMonth = await this.users
      .createQueryBuilder('u')
      .where('u.created_at >= :since', { since: sinceLastMonth })
      .getCount()
    return { totalUsers: total, adminUsers: admins, newThisMonth }
  }

  async findAllUsers(requesterId: string) {
    const users = await this.users
      .createQueryBuilder('u')
      .select([
        'u.id', 'u.email', 'u.name', 'u.role',
        'u.onboardingCompleted', 'u.currency', 'u.totalBalance',
        'u.createdAt', 'u.updatedAt',
      ])
      .addSelect((sub) =>
        sub.select('COUNT(*)', 'txCount')
           .from('expenses', 'e')
           .where('e.user_id = u.id'),
        'u_txCount',
      )
      .orderBy('u.createdAt', 'DESC')
      .getRawMany()

    return users.map((u) => ({
      id: u.u_id,
      email: u.u_email,
      name: u.u_name,
      role: u.u_role,
      onboardingCompleted: u.u_onboarding_completed,
      currency: u.u_currency,
      totalBalance: parseFloat(u.u_total_balance) || 0,
      transactionCount: parseInt(u.u_txCount) || 0,
      createdAt: u.u_created_at,
      updatedAt: u.u_updated_at,
    }))
  }

  async getUserDetail(id: string) {
    const user = await this.users.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')
    const { passwordHash: _, ...safe } = user as any
    return safe
  }

  async setRole(id: string, role: 'user' | 'admin'): Promise<void> {
    const user = await this.users.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')
    await this.users.update(id, { role })
  }

  async disableUser(id: string): Promise<void> {
    await this.setRole(id, 'user')
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.users.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')
    await this.users.remove(user)
  }
}
