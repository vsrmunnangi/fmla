import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Raw documents + package snapshots (§2 row 6). Behind S3_ENDPOINT/S3_BUCKET/AWS_REGION
 * (§3) — empty S3_ENDPOINT means real AWS S3; set it only to point at MinIO. */
@Injectable()
export class S3Service {
  private client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });

  private get bucket(): string {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET not configured');
    return bucket;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  /** processor reads documents via presigned GET (§7.1) — this is how api hands it one. */
  async presignedGetUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }
}
