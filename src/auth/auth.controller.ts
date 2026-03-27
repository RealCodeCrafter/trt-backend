import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-auth.dto';
import { RolesGuard } from './roles.guard';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decarotor';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'CHANGE_ME' },
      },
    },
  })
  async login(
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    return await this.authService.login(username, password);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin')
  @Post('add-admin')
  @ApiBearerAuth('bearer')
  @ApiBody({ type: CreateUserDto })
  async addAdmin(@Body() createUserDto: CreateUserDto) {
    return await this.authService.addAdmin(createUserDto);
  }
}