import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('Foydalanuvchi topilmadi');
    }

    const roles = this.getRoles(context);

    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Ruxsat yo\'q');
    }

    return true;
  }

  private getRoles(context: ExecutionContext): string[] {
    const handler = context.getHandler();
    return Reflect.getMetadata('roles', handler) || [];
  }
}