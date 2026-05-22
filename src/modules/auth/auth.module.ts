import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConstants } from "src/common/constants/app.constants";
import { SharedModule } from "src/common/shared/shared.module";
import { UserModule } from "../user/user.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./service/auth.service";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [UserModule, SharedModule, ConfigModule, NotificationModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AppConstants.AUTH_SERVICE_TOKEN,
      useClass: AuthService,
    },
  ],
  exports: [AppConstants.AUTH_SERVICE_TOKEN],
})
export class AuthModule { }
