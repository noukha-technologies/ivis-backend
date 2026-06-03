import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { AdminPc } from '../entity/admin-pc.entity';

@Injectable()
export class AdminPcDao extends Repository<AdminPc> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(AdminPc, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<AdminPc | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { line: { centre: true } },
    });
  }

  async findActiveByLineId(lineId: string): Promise<AdminPc | null> {
    return this.findOne({ where: { line_id: lineId, is_deleted: false } });
  }

  async findByCode(code: string): Promise<AdminPc | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByAdminPcId(adminPcId: number): Promise<AdminPc | null> {
    return this.findOne({ where: { admin_pc_id: adminPcId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<AdminPc>> {
    const qb = this.createQueryBuilder('adminPc')
      .leftJoinAndSelect('adminPc.line', 'line')
      .leftJoinAndSelect('line.centre', 'centre')
      .where('adminPc.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<AdminPc, AdminPc>(query, {
      searchFields: [
        'adminPc.name',
        'adminPc.code',
        'adminPc.ip_address',
        'adminPc.status',
        'line.name',
        'line.code',
        'centre.name',
        'centre.code',
      ],
      allowedSortFields: ['admin_pc_id', 'name', 'code', 'ip_address', 'status', 'created_at'],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'adminPc', options);
    return toPaginatedResult(response);
  }

  async getNextId(): Promise<number> {
    const result = await this.createQueryBuilder('pc')
      .select('MAX(pc.admin_pc_id)', 'max')
      .getRawOne();
    return (result?.max ? Number(result.max) : 0) + 1;
  }
}
