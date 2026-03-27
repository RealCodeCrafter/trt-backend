import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/auth.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    if (user.role !== 'admin' && user.role !== 'superAdmin') {
      throw new UnauthorizedException('Ruxsat yo\'q');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Parol noto‘g‘ri');
    }

    const payload = { id: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      message: 'Kirish muvaffaqiyatli amalga oshirildi',
    };
  }

  async addAdmin(createUserDto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({ where: { username: createUserDto.username } });
    if (existingUser) {
      throw new BadRequestException('Foydalanuvchi allaqachon mavjud');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const newAdmin = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: 'admin',
    });

    const savedAdmin = await this.userRepository.save(newAdmin);
    return {
      id: savedAdmin.id,
      username: savedAdmin.username,
      email: savedAdmin.email,
      role: savedAdmin.role,
      message: 'Admin muvaffaqiyatli qo\'shildi',
    };
  }
}