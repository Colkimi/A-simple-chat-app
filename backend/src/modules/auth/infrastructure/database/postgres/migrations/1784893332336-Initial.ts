import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1784893332336 implements MigrationInterface {
  name = 'Initial1784893332336';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "app_auth"`);
    await queryRunner.query(
      `CREATE TABLE "app_auth"."refresh_tokens" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "token" text NOT NULL, "identifier" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")); COMMENT ON COLUMN "app_auth"."refresh_tokens"."token" IS 'The hashed string of the actual token'; COMMENT ON COLUMN "app_auth"."refresh_tokens"."identifier" IS 'A unique id to identify the jwt. usually a uuid'`,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_user_id_idx" ON "app_auth"."refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refresh_tokens_identifier_uniq" ON "app_auth"."refresh_tokens"  ("identifier") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "app_auth"."refresh_tokens_identifier_uniq"`,
    );
    await queryRunner.query(`DROP INDEX "app_auth"."refresh_tokens_user_id_idx"`);
    await queryRunner.query(`DROP TABLE "app_auth"."refresh_tokens"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "app_auth" CASCADE`);
  }
}
