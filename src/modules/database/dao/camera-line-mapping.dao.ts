import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { CameraLineMapping } from '../entity/camera-line-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class CameraLineMappingDao extends Repository<CameraLineMapping> {
  constructor(private readonly dataSource: DataSource) {
    super(CameraLineMapping, dataSource.createEntityManager());
  }

  async findActiveByLineIds(lineIds: string[]): Promise<CameraLineMapping[]> {
    if (!lineIds.length) return [];
    return this.find({
      where: { line_id: In(lineIds), is_deleted: false },
    });
  }

  async replaceForCamera(
    cameraId: string,
    lineIds: string[],
    actorId?: string,
  ): Promise<void> {
    // Soft delete existing mappings
    await this.update({ camera_id: cameraId }, { is_deleted: true });

    if (!lineIds.length) return;

    // Create new mappings
    const mappings = lineIds.map((lineId) =>
      this.create({
        id: generateSnowflakeId(),
        camera_id: cameraId,
        line_id: lineId,
        created_by: actorId,
      }),
    );
    await this.save(mappings);
  }
}
