import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../exceptions/custom.exception';
import { CentreDao } from '../../modules/database/dao/centre.dao';
import { LineDao } from '../../modules/database/dao/line.dao';
import { CameraDao } from '../../modules/database/dao/camera.dao';
import { AdminPcLineMappingDao } from '../../modules/database/dao/admin-pc-line-mapping.dao';
import { CameraLineMappingDao } from '../../modules/database/dao/camera-line-mapping.dao';
import { isGlobalScope } from '../constants/access-scope';

@Injectable()
export class MasterScopeService {
  constructor(
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly cameraDao: CameraDao,
    private readonly adminPcLineMappingDao: AdminPcLineMappingDao,
    private readonly cameraLineMappingDao: CameraLineMappingDao,
  ) {}

  /**
   * Centre filter for list/read queries based on the caller's role scope.
   * - Global (Super Admin) → `null`: no centre restriction, sees all centres.
   * - Centre-scoped → the user's assigned `center_id` (or null if unset).
   * Callers add `WHERE center_id = <result>` only when the result is non-null.
   */
  resolveCentreFilter(user: {
    access_scope?: string | null;
    center_id?: string | null;
  }): string | null {
    return isGlobalScope(user.access_scope) ? null : (user.center_id ?? null);
  }

  async resolveCentreId(centreId: string): Promise<string> {
    const centre = await this.centreDao.findActiveById(centreId);
    if (!centre) {
      throw new ResourceNotFoundException('Centre', centreId);
    }
    return centre.id;
  }

  async assertLinesBelongToCentre(
    lineIds: string[],
    centreId: string,
  ): Promise<void> {
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

  async assertLinesHaveNoCamera(
    lineIds: string[],
    excludeCameraId?: string,
  ): Promise<void> {
    if (!lineIds.length) {
      return;
    }
    const conflicts =
      await this.cameraLineMappingDao.findActiveByLineIds(lineIds);
    for (const mapping of conflicts) {
      if (excludeCameraId && mapping.camera_id === excludeCameraId) {
        continue;
      }
      throw new DuplicateResourceException(
        'Camera',
        'line_id',
        mapping.line_id,
      );
    }
  }

  async assertLineHasNoCamera(
    lineId: string,
    excludeCameraId?: string,
  ): Promise<void> {
    await this.assertLinesHaveNoCamera([lineId], excludeCameraId);
  }

  async assertLineHasNoAdminPc(
    lineId: string,
    excludeAdminPcId?: string,
  ): Promise<void> {
    await this.assertLinesHaveNoAdminPc([lineId], excludeAdminPcId);
  }

  async assertLinesHaveNoAdminPc(
    lineIds: string[],
    excludeAdminPcId?: string,
  ): Promise<void> {
    if (!lineIds.length) {
      return;
    }

    const conflicts =
      await this.adminPcLineMappingDao.findActiveByLineIds(lineIds);
    for (const mapping of conflicts) {
      if (excludeAdminPcId && mapping.admin_pc_id === excludeAdminPcId) {
        continue;
      }
      throw new DuplicateResourceException(
        'AdminPc',
        'line_id',
        mapping.line_id,
      );
    }
  }

  async assertLineExists(lineId: string): Promise<void> {
    const line = await this.lineDao.findActiveById(lineId);
    if (!line) {
      throw new ResourceNotFoundException('Line', lineId);
    }
  }
}
