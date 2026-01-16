import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({ where: { username: createUserDto.username } });
    if (existingUser) {
      throw new BadRequestException('Foydalanuvchi allaqachon mavjud');
    }

    // Faqat user roli bilan ro'yxatdan o'tish mumkin, admin va superAdmin qo'lda yaratiladi
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const newUser = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: 'user',
    });

    const savedUser = await this.userRepository.save(newUser);
    const payload = { id: savedUser.id, username: savedUser.username, role: savedUser.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: savedUser.id,
        username: savedUser.username,
        email: savedUser.email,
        role: savedUser.role,
      },
      message: 'Foydalanuvchi muvaffaqiyatli ro\'yxatdan o\'tdi',
    };
  }

  async login(username: string, password: string) {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
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

  private generateStrongPassword(length: number = 20): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = uppercase + lowercase + numbers + special;
    
    let password = '';
    // Har bir turdan kamida bitta belgi bo'lishi kerak
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Qolgan belgilar
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Parolni aralashtirish
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  private generateStrongUsername(): string {
    const prefix = 'superadmin';
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now().toString(36).substring(0, 6);
    return `${prefix}_${randomSuffix}_${timestamp}`;
  }

  async createSuperAdminIfNotExists() {
    // Avtomatik kuchli login va parol yaratish
    const superAdminUsername = this.generateStrongUsername();
    const superAdminPassword = this.generateStrongPassword(24);
    const superAdminEmail = this.configService.get('SUPERADMIN_EMAIL') || 'superadmin@trt-parts.com';

    const existingSuperAdmin = await this.userRepository.findOne({
      where: { role: 'superAdmin' },
    });

    if (existingSuperAdmin) {
      console.log('========================================');
      console.log('SuperAdmin allaqachon mavjud:');
      console.log(`Username: ${existingSuperAdmin.username}`);
      console.log(`Email: ${existingSuperAdmin.email}`);
      console.log(`Role: ${existingSuperAdmin.role}`);
      console.log('========================================');
      return;
    }

    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    const superAdmin = this.userRepository.create({
      username: superAdminUsername,
      password: hashedPassword,
      email: superAdminEmail,
      role: 'superAdmin',
    });

    const savedSuperAdmin = await this.userRepository.save(superAdmin);

    console.log('========================================');
    console.log('SuperAdmin muvaffaqiyatli yaratildi!');
    console.log('========================================');
    console.log('LOGIN MA\'LUMOTLARI:');
    console.log(`Username: ${savedSuperAdmin.username}`);
    console.log(`Password: ${superAdminPassword}`);
    console.log(`Email: ${savedSuperAdmin.email}`);
    console.log(`Role: ${savedSuperAdmin.role}`);
    console.log('========================================');
    console.log('DIQQAT: Bu ma\'lumotlarni xavfsiz joyda saqlang!');
    console.log('========================================');
  }
}