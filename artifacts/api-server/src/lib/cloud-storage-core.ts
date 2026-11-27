export const CLOUD_STORAGE_QUOTA_BYTES=10*1024*1024*1024;
export const CLOUD_STORAGE_CATEGORIES=["video","lesson","assignment","exercise","study_group","message","document","other"] as const;
export type CloudStorageCategory=typeof CLOUD_STORAGE_CATEGORIES[number];
export function isCloudStorageCategory(v:unknown):v is CloudStorageCategory{return typeof v==="string"&&(CLOUD_STORAGE_CATEGORIES as readonly string[]).includes(v);}
export function safeCloudFileName(v:unknown):string{return (typeof v==="string"?v:"learning-file").replace(/[\\/\0-\x1f\x7f]/g,"_").trim().slice(0,180)||"learning-file";}
