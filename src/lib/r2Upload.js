// src/lib/r2Upload.js

const ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID;
const BUCKET_NAME = import.meta.env.VITE_R2_BUCKET_NAME;
const TOKEN = import.meta.env.VITE_R2_TOKEN;
const PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL;

/**
 * Uploads a single file to Cloudflare R2.
 * @param {File} file - The file object to upload.
 * @param {function} onProgress - Optional callback with (fileName, status) for UI feedback.
 * @returns {Promise<string>} - The public URL of the uploaded file.
 */
export const uploadFileToR2 = async (file, onProgress) => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(file.name)}`;

  if (onProgress) onProgress(file.name, 'uploading');

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload ${file.name}: ${response.status} ${errorText}`);
  }

  if (onProgress) onProgress(file.name, 'done');

  // Return the full public URL for this file
  return `${PUBLIC_URL}/${file.name}`;
};

/**
 * Uploads an array of files to Cloudflare R2 in parallel.
 * @param {File[]} files - Array of file objects to upload.
 * @param {function} onProgress - Optional callback with (fileName, status) for UI feedback.
 * @returns {Promise<Map<string, string>>} - A map of filename -> public URL.
 */
export const uploadFilesToR2 = async (files, onProgress) => {
  const urlMap = new Map();

  // Upload all files in parallel for speed
  await Promise.all(
    files.map(async (file) => {
      const publicUrl = await uploadFileToR2(file, onProgress);
      urlMap.set(file.name, publicUrl);
    })
  );

  return urlMap;
};
