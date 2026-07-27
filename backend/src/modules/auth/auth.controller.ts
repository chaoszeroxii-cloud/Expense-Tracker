import { Controller, Post, Get, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { AuthService, DEFAULT_WALLETS } from './auth.service'
import {
  RegisterDto, LoginDto, UpdateProfileDto, GoogleVerifyDto, FacebookVerifyDto,
  ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto,
  UpdatePreferencesDto, CompleteOnboardingDto,
} from './auth.dto'
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

  // POST /api/auth/google/verify  (public)
  @Public()
  @Post('google/verify')
  @HttpCode(HttpStatus.OK)
  googleVerify(@Body() dto: GoogleVerifyDto) {
    return this.service.googleVerify(dto)
  }

  // POST /api/auth/facebook/verify  (public)
  @Public()
  @Post('facebook/verify')
  @HttpCode(HttpStatus.OK)
  facebookVerify(@Body() dto: FacebookVerifyDto) {
    return this.service.facebookVerify(dto)
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

  // PATCH /api/auth/preferences  (protected)
  // Spending plan, timezone, work-time lens and advanced mode. Separate from
  // /profile so a single setting can be changed without resending identity fields.
  @Patch('preferences')
  updatePreferences(@CurrentUser() user: User, @Body() dto: UpdatePreferencesDto) {
    return this.service.updatePreferences(user.id, dto)
  }

  // POST /api/auth/onboarding  (protected)
  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@CurrentUser() user: User, @Body() dto: CompleteOnboardingDto) {
    return this.service.completeOnboarding(user.id, dto)
  }

  // POST /api/auth/starter-wallets  (protected)
  // Opting in to envelope budgeting. No longer part of onboarding.
  @Post('starter-wallets')
  @HttpCode(HttpStatus.OK)
  createStarterWallets(
    @CurrentUser() user: User,
    @Body() body: { wallets: string[]; lang?: 'th' | 'en' },
  ) {
    return this.service.createStarterWallets(user.id, body.wallets ?? [], body.lang ?? 'th')
  }

  // PATCH /api/auth/change-password  (protected)
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.service.changePassword(user.id, dto)
  }

  // POST /api/auth/forgot-password  (public, rate-limited)
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.service.forgotPassword(dto.email)
  }

  // POST /api/auth/reset-password  (public)
  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto.token, dto.password)
  }

  // GET /api/auth/onboarding/wallets  (public reference)
  @Get('onboarding/wallets')
  getDefaultWallets() {
    return DEFAULT_WALLETS
  }
}
