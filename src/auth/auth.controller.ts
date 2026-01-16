import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-auth.dto';
import { RolesGuard } from './roles.guard';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decarotor';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return await this.authService.register(createUserDto);
  }

  @Post('login')
  async login(
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    return await this.authService.login(username, password);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post('add-admin')
  async addAdmin(@Body() createUserDto: CreateUserDto) {
    return await this.authService.addAdmin(createUserDto);
  }
}