import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './service/auth.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [OnboardingModule, AuditLogsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
