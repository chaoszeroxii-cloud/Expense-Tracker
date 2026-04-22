import { Controller, Post, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
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
}
