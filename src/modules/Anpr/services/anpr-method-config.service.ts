import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CameraIntegrationMethod } from "../../../common/enums/camera.enums";
import { CameraEntity } from '../../database/entity/camera.entity';

@Injectable()
export class AnprMethodConfigService {
    private readonly logger = new Logger(AnprMethodConfigService.name);

    constructor(
        @InjectRepository(CameraEntity)
        private readonly cameraRepo: Repository<CameraEntity>,
    ) { }

    async validateAllCameras(): Promise<void> {
        this.logger.log("Validating all camera configurations...");
        try {
            const count = await this.cameraRepo.count();
            this.logger.log(`Found ${count} camera configuration(s) in database.`);
        } catch (err) {
            if (err instanceof QueryFailedError) {
                const code = (err.driverError as { code?: string } | undefined)?.code;
                if (code === "42P01") {
                    this.logger.warn(
                        'opal_ivis tables are missing. Run `npm run migration:generate` with DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME set, then restart.',
                    );
                    return;
                }
            }
            throw err;
        }
    }

    isMethodEnabled(camera: CameraEntity, method: string): boolean {
        return String(camera.integrationMethod ?? CameraIntegrationMethod.PUSH) === method;
    }

    configuredMethod(camera: CameraEntity): CameraIntegrationMethod {
        return (camera.integrationMethod ?? CameraIntegrationMethod.PUSH) as CameraIntegrationMethod;
    }

    /** Maps inbound channel on stored events to camera integration method. */
    sourceMethodToIntegration(
        sourceMethod: string | null | undefined,
    ): CameraIntegrationMethod | null {
        if (!sourceMethod?.trim()) {
            return null;
        }
        switch (sourceMethod.trim().toUpperCase()) {
            case 'A':
            case 'PUSH':
                return CameraIntegrationMethod.PUSH;
            case 'C':
            case 'FTP':
                return CameraIntegrationMethod.FTP;
            default:
                return null;
        }
    }

    acceptsInbound(camera: CameraEntity, channel: CameraIntegrationMethod): boolean {
        return this.configuredMethod(camera) === channel;
    }

    logInboundRejection(
        camera: CameraEntity,
        channel: CameraIntegrationMethod,
        context: string,
    ): void {
        this.logger.warn(
            `[ANPR Method] Rejected ${context} for camera ${camera.cameraCode}: ` +
            `registered as ${this.configuredMethod(camera)}, not ${channel}`,
        );
    }

    async findActiveCamerasWithFtp(): Promise<CameraEntity[]> {
        try {
            const cameras = await this.cameraRepo.find({ where: { status: 'Active', is_deleted: false } });
            return cameras.filter(
                (c) =>
                    this.isMethodEnabled(c, 'FTP') &&
                    Boolean((c.ftpDirectory ?? '').trim()),
            );
        } catch (err) {
            if (err instanceof QueryFailedError) {
                const code = (err.driverError as { code?: string } | undefined)?.code;
                if (code === '42P01') {
                    return [];
                }
            }
            throw err;
        }
    }

    async findCameraById(id: string): Promise<CameraEntity | null> {
        return this.cameraRepo.findOne({ where: { id } });
    }
}
