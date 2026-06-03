import { Global, Module } from '@nestjs/common';
import { MasterScopeService } from './master-scope.service';

@Global()
@Module({
  providers: [MasterScopeService],
  exports: [MasterScopeService],
})
export class MasterScopeModule {}
