import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SearchUsersRequest {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  filter: string;
}

