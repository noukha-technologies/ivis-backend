import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { AppConstants } from "src/common/constants/app.constants";
import { DatabaseModule } from "../database/database.module";
import { PermissionsController } from "./permissions.controller";
import { PermissionService } from "./service/permission.service";

@Module({
    imports: [HttpModule, DatabaseModule],
    controllers: [PermissionsController],
    providers: [
        {
            provide: AppConstants.PERMISSION_SERVICE_TOKEN,
            useClass: PermissionService
        }
    ],
    exports: [AppConstants.PERMISSION_SERVICE_TOKEN],
})
export class PermissionsModule { } 