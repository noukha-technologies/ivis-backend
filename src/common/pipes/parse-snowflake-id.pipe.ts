import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseSnowflakeIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d{1,20}$/.test(value)) {
      throw new BadRequestException('Invalid snowflake id');
    }
    return value;
  }
}
