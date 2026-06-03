import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../exceptions/custom.exception';
import { CentreDao } from '../../modules/database/dao/centre.dao';
import { LineDao } from '../../modules/database/dao/line.dao';
import { UsersDao } from '../../modules/database/dao/users.dao';
import { CameraDao } from '../../modules/database/dao/camera.dao';
import { AdminPcDao } from '../../modules/database/dao/admin-pc.dao';

@Injectable()
export class MasterScopeService {
  constructor(
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly usersDao: UsersDao,
    private readonly cameraDao: CameraDao,
    private readonly adminPcDao: AdminPcDao,
  ) {}

  async resolveCentreId(centreId: string): Promise<string> {
    const centre = await this.centreDao.findActiveById(centreId);
    if (!centre) {
      throw new ResourceNotFoundException('Centre', centreId);
    }
    return centre.id;
  }

  async assertCentreNotAssignedToOtherUser(
    centreId: string,
    excludeUserId?: string,
  ): Promise<void> {
    const existing = await this.usersDao.findActiveByCenterId(centreId);
    if (existing && existing.id !== excludeUserId) {
      throw new DuplicateResourceException('Centre', 'center_id', centreId);
    }
  }

  async assertLinesBelongToCentre(lineIds: string[], centreId: string): Promise<void> {
    if (!lineIds.length) {
      return;
    }
    const lines = await this.lineDao.findActiveByIds(lineIds);
    if (lines.length !== lineIds.length) {
      const found = new Set(lines.map((l) => l.id));
      const missing = lineIds.find((id) => !found.has(id));
      throw new ResourceNotFoundException('Line', missing ?? lineIds[0]);
    }
    const invalid = lines.find((line) => line.centre_id !== centreId);
    if (invalid) {
      throw new BadRequestException(
        `Line '${invalid.id}' does not belong to the selected centre.`,
      );
    }
  }

  async assertLineHasNoCamera(lineId: string, excludeCameraId?: string): Promise<void> {
    const existing = await this.cameraDao.findActiveByLineId(lineId);
    if (existing && existing.id !== excludeCameraId) {
      throw new DuplicateResourceException('Camera', 'line_id', lineId);
    }
  }

  async assertLineHasNoAdminPc(lineId: string, excludeAdminPcId?: string): Promise<void> {
    const existing = await this.adminPcDao.findActiveByLineId(lineId);
    if (existing && existing.id !== excludeAdminPcId) {
      throw new DuplicateResourceException('AdminPc', 'line_id', lineId);
    }
  }

  async assertLineExists(lineId: string): Promise<void> {
    const line = await this.lineDao.findActiveById(lineId);
    if (!line) {
      throw new ResourceNotFoundException('Line', lineId);
    }
  }
}
