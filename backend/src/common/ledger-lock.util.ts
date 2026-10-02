import { NotFoundException } from '@nestjs/common'
import { EntityManager } from 'typeorm'
import { User } from '../modules/users/user.entity'

/** Always lock the account before its entries/wallets. Serializes only this user's money writes. */
export async function lockLedger(em: EntityManager, userId: string): Promise<User> {
  const user = await em.getRepository(User).findOne({
    where: { id: userId }, lock: { mode: 'pessimistic_write' },
  })
  if (!user) throw new NotFoundException('User not found')
  return user
}
