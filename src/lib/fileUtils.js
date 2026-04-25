// src/lib/fileUtils.js
import Papa from 'papaparse';
import JSZip from 'jszip';

/**
 * Renames uploaded image files based on a prefix.
 * Example: 001-pano.jpg -> MYPREFIX_001.jpg
 * @param {File[]} imageFiles - The array of original image files.
 * @param {string} prefix - The user-provided prefix, with trailing underscore.
 * @returns {Promise<File[]>} - A promise that resolves to an array of new file objects.
 */
export const renameImageFiles = async (imageFiles, prefix) => {
  const renamedFiles = imageFiles.map((file) => {
    const match = file.name.match(/^(\d+)-pano\.jpg$/i);
    if (match && match[1]) {
      const originalNumber = match[1].padStart(5, '0');
      const newName = `${prefix}${originalNumber}.jpg`;
      return new File([file], newName, { type: file.type });
    }
    return null;
  });
  return renamedFiles.filter(file => file !== null);
};

/**
 * Parses a CSV file and converts it to a JSON object.
 * Now accepts a urlMap to embed the full R2 public URL into each entry.
 * @param {File} csvFile - The uploaded CSV file.
 * @param {string} prefix - The user-provided prefix to build the new keys.
 * @param {Map<string, string>} urlMap - A map of filename -> full R2 public URL.
 * @returns {Promise<object>} - A promise that resolves to the converted JSON object.
 */
export const convertCsvToJson = (csvFile, prefix, urlMap = new Map()) => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvFile, {
      delimiter: ';',
      header: false,
      skipEmptyLines: true,
      comments: '#',
      complete: (results) => {
        try {
          const convertedData = {};
          const col_names = [
            'ID', 'filename', 'timestamp', 'pano_pos_x', 'pano_pos_y', 'pano_pos_z',
            'pano_ori_w', 'pano_ori_x', 'pano_ori_y', 'pano_ori_z'
          ];

          results.data.forEach((rowArray, rowIndex) => {
            const row = col_names.reduce((obj, key, index) => {
              obj[key] = rowArray[index] ? rowArray[index].trim() : undefined;
              return obj;
            }, {});

            if (!row.filename) {
              console.warn(`Skipping row ${rowIndex + 2} due to missing filename.`);
              return;
            }

            const shot_number = String(row.filename).split('-')[0];
            const key = `${prefix}${shot_number.padStart(5, '0')}.jpg`;

            // Look up the full R2 public URL from the upload step
            const publicUrl = urlMap.get(key) || null;

            convertedData[key] = {
              id: parseInt(row.ID, 10),
              // Embed the full R2 URL so map viewers don't need to construct it
              url: publicUrl,
              timestamp: parseFloat(row.timestamp),
              position: {
                x: parseFloat(row.pano_pos_x),
                y: parseFloat(row.pano_pos_y),
                z: parseFloat(row.pano_pos_z),
              },
              orientation: {
                w: parseFloat(row.pano_ori_w),
                x: parseFloat(row.pano_ori_x),
                y: parseFloat(row.pano_ori_y),
                z: parseFloat(row.pano_ori_z),
              },
            };
          });
          resolve(convertedData);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};

/**
 * Merges newly converted JSON data into existing JSON data.
 * New data takes precedence and will overwrite existing keys.
 * @param {object} existingJson - The parsed JSON from the uploaded file.
 * @param {object} newJson - The JSON object converted from the CSV.
 * @returns {object} - The final merged JSON object.
 */
export const mergeJsonData = (existingJson, newJson) => {
  return { ...existingJson, ...newJson };
};

/**
 * Creates a zip archive from an array of files.
 * Kept for optional local backup use.
 * @param {File[]} files - The files to add to the zip.
 * @param {string} zipName - The name of the zip file.
 * @returns {Promise<Blob>} - A promise that resolves to the zip file blob.
 */
export const createZip = async (files, zipName) => {
  const zip = new JSZip();
  files.forEach((file) => {
    zip.file(file.name, file);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
};
