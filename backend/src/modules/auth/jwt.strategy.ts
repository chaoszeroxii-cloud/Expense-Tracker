import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../users/user.entity'
import { getJwtSecret } from '../../config/jwt.config'

export interface JwtPayload {
  sub: string   // user id
  email: string
  tv?: number   // token version — must match user.tokenVersion
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
      ignoreExpiration: false,
    })
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.users.findOne({ where: { id: payload.sub } })
    if (!user) throw new UnauthorizedException('Token invalid')
    // Reject tokens issued before the last password change/reset.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Token has been revoked')
    }
    return user
  }
}
