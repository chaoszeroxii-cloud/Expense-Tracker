import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Investment, InvestmentTransaction } from './investment.entity'
import { CreateInvestmentDto, AddInvestmentTransactionDto } from './dto/investment.dto'

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(Investment) private readonly repo: Repository<Investment>,
    @InjectRepository(InvestmentTransaction) private readonly txRepo: Repository<InvestmentTransaction>,
  ) {}

  async create(userId: string, dto: CreateInvestmentDto): Promise<Investment> {
    return this.repo.save(this.repo.create({ userId, ...dto }))
  }

  async findAll(userId: string) {
    const investments = await this.repo.find({
      where: { userId },
      relations: ['transactions'],
      order: { createdAt: 'DESC' },
    })
    return investments.map((inv) => this.enrich(inv))
  }

  async addTransaction(userId: string, investmentId: string, dto: AddInvestmentTransactionDto) {
    const inv = await this.repo.findOne({ where: { id: investmentId, userId } })
    if (!inv) throw new NotFoundException('Investment not found')
    return this.txRepo.save(
      this.txRepo.create({
        investmentId,
        userId,
        type: dto.type,
        amount: dto.amount,
        units: dto.units,
        navPrice: dto.navPrice,
        occurredAt: new Date(dto.occurredAt),
        note: dto.note,
      }),
    )
  }

  async remove(userId: string, id: string): Promise<void> {
    const inv = await this.repo.findOne({ where: { id, userId } })
    if (!inv) throw new NotFoundException('Investment not found')
    await this.repo.remove(inv)
  }

  async removeTransaction(userId: string, txId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { id: txId, userId } })
    if (!tx) throw new NotFoundException('Transaction not found')
    await this.txRepo.remove(tx)
  }

  private enrich(inv: Investment) {
    const buys = inv.transactions.filter((t) => t.type === 'buy')
    const sells = inv.transactions.filter((t) => t.type === 'sell')
    const totalCost = buys.reduce((s, t) => s + parseFloat(t.amount as any), 0)
    const totalSold = sells.reduce((s, t) => s + parseFloat(t.amount as any), 0)
    const totalUnits = buys.reduce((s, t) => s + (parseFloat(t.units as any) || 0), 0)
      - sells.reduce((s, t) => s + (parseFloat(t.units as any) || 0), 0)

    return {
      id: inv.id,
      name: inv.name,
      symbol: inv.symbol,
      type: inv.type,
      note: inv.note,
      totalCost,
      totalSold,
      netCost: totalCost - totalSold,
      totalUnits,
      transactions: inv.transactions,
      createdAt: inv.createdAt,
    }
  }
}
