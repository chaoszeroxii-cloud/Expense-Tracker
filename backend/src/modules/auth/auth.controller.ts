import { Controller, Post, Get, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { AuthService, DEFAULT_WALLETS } from './auth.service'
import { RegisterDto, LoginDto, UpdateProfileDto } from './auth.dto'
import { JwtAuthGuard } from './jwt-auth.guard'
import { Public } from './jwt-auth.guard'
import { CurrentUser } from './current-user.decorator'
import { User } from '../users/user.entity'

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly service: AuthService) {}

  // POST /api/auth/register  (public)
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto)
  }

  // POST /api/auth/login  (public)
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto)
  }

  // GET /api/auth/me  (protected)
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.service.me(user)
  }

  // PATCH /api/auth/profile  (protected)
  @Patch('profile')
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.service.updateProfile(user.id, dto)
  }

  // POST /api/auth/onboarding  (protected)
  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@CurrentUser() user: User, @Body() body: { wallets: string[]; lang?: 'th' | 'en' }) {
    return this.service.completeOnboarding(user.id, body.wallets ?? [], body.lang ?? 'th')
  }

  // GET /api/auth/onboarding/wallets  (public reference)
  @Get('onboarding/wallets')
  getDefaultWallets() {
    return DEFAULT_WALLETS
  }
}
