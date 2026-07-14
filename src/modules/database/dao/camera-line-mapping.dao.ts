import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CameraLineMapping } from '../entity/camera-line-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class CameraLineMappingDao extends Repository<CameraLineMapping> {
  constructor(private readonly dataSource: DataSource) {
    super(CameraLineMapping, dataSource.createEntityManager());
  }

  async findActiveByLineIds(lineIds: string[]): Promise<CameraLineMapping[]> {
    if (!lineIds.length) return [];
    // Only count mappings whose camera is still active — soft-deleted cameras
    // must not block reassignment of their former lines.
    return this.createQueryBuilder('mapping')
      .innerJoin('mapping.camera', 'camera')
      .where('mapping.line_id IN (:...lineIds)', { lineIds })
      .andWhere('mapping.is_deleted = false')
      .andWhere('camera.is_deleted = false')
      .getMany();
  }

  /**
   * Soft-delete mapping rows left behind when a camera was deleted before
   * mappings were cleaned up. Those orphans still have is_deleted=false and
   * block the partial unique index on line_id.
   */
  async softDeleteOrphanMappingsForLines(lineIds: string[]): Promise<void> {
    if (!lineIds.length) return;

    const orphans = await this.createQueryBuilder('mapping')
      .innerJoin('mapping.camera', 'camera')
      .where('mapping.line_id IN (:...lineIds)', { lineIds })
      .andWhere('mapping.is_deleted = false')
      .andWhere('camera.is_deleted = true')
      .getMany();

    if (!orphans.length) return;

    await this.createQueryBuilder()
      .update(CameraLineMapping)
      .set({ is_deleted: true })
      .whereInIds(orphans.map((m) => m.id))
      .execute();
  }

  async replaceForCamera(
    cameraId: string,
    lineIds: string[],
    actorId?: string,
  ): Promise<void> {
    // Soft delete existing mappings for this camera
    await this.update(
      { camera_id: cameraId, is_deleted: false },
      { is_deleted: true },
    );

    if (!lineIds.length) return;

    // Clear orphans from previously deleted cameras on these lines
    await this.softDeleteOrphanMappingsForLines(lineIds);

    // Create new mappings
    const mappings = lineIds.map((lineId) =>
      this.create({
        id: generateSnowflakeId(),
        camera_id: cameraId,
        line_id: lineId,
        created_by: actorId,
        is_deleted: false,
      }),
    );
    await this.save(mappings);
  }

  async softDeleteByCameraId(cameraId: string): Promise<void> {
    await this.update(
      { camera_id: cameraId, is_deleted: false },
      { is_deleted: true },
    );
  }
}
