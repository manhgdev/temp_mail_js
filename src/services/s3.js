import { DeleteObjectsCommand, GetObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ENV } from '../config/env.js';

const s3Client = new S3Client({
  endpoint: ENV.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: ENV.S3_ACCESS_KEY,
    secretAccessKey: ENV.S3_SECRET_KEY
  }
});

const trimSlash = (value) => value.replace(/\/+$/, '');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const uploadFile = async (key, body, contentType = 'application/octet-stream') => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: ENV.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  const endpoint = trimSlash(ENV.S3_ENDPOINT);
  return `${endpoint}/${ENV.S3_BUCKET}/${encodeURI(key)}`;
};

export const getObject = async (key) =>
  s3Client.send(
    new GetObjectCommand({
      Bucket: ENV.S3_BUCKET,
      Key: key
    })
  );

export const getObjectText = async (key) => {
  const response = await getObject(key);
  return response.Body ? response.Body.transformToString() : '';
};

export const deleteFiles = async (keys = []) => {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!uniqueKeys.length) {
    return;
  }

  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const chunk = uniqueKeys.slice(index, index + 1000);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: ENV.S3_BUCKET,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: true
        }
      })
    );
  }
};

export const extractObjectKeyFromUrl = (url) => {
  if (!url) {
    return null;
  }

  const endpoint = trimSlash(ENV.S3_ENDPOINT);
  const bucketPrefix = `${endpoint}/${ENV.S3_BUCKET}/`;

  if (url.startsWith(bucketPrefix)) {
    return decodeURIComponent(url.slice(bucketPrefix.length));
  }

  const bucketPattern = new RegExp(`/${escapeRegExp(ENV.S3_BUCKET)}/(.+)$`);
  const match = url.match(bucketPattern);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1]);
};

export default s3Client;
