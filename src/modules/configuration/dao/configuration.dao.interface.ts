import { Configurations } from '../../database/entity/configuration.entity';

export interface IConfigurationDao {
  findByCentreId(centreId: string): Promise<Configurations | null>;
  getNextConfigurationId(): Promise<number>;
}
