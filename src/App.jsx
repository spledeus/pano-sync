// src/App.jsx
import { useState, useEffect } from 'react';
import './App.css';
import FileUploader from './components/FileUploader';
import PrefixInput from './components/PrefixInput';
import ActionPanel from './components/ActionPanel';
import Modal from './components/Modal';
import {
  renameImageFiles,
  convertCsvToJson,
  mergeJsonData,
} from './lib/fileUtils';
import { uploadFilesToR2, uploadJsonToR2, fetchJsonFromR2 } from './lib/r2Upload';

function App() {
  // state for user-uploaded files
  const [imageFiles, setImageFiles] = useState([]);
  const [csvFile, setCsvFile] = useState(null);

  // master JSON fetched from R2 on load
  const [masterJson, setMasterJson] = useState(null);
  const [jsonLoadError, setJsonLoadError] = useState(null);

  // state for user input and ui control
  const [prefix, setPrefix] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({});
  const [results, setResults] = useState(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

  // fetch the master JSON from R2 when the app first loads
  useEffect(() => {
    fetchJsonFromR2()
      .then((data) => setMasterJson(data))
      .catch((err) => {
        console.error('Could not load pano_data.json from R2:', err);
        setJsonLoadError(err.message);
      });
  }, []);

  // handler to sort files from the consolidated uploader
  const handleFileSelection = (selectedFiles) => {
    const csv = selectedFiles.find(file => file.name.toLowerCase().endsWith('.csv'));
    const images = selectedFiles.filter(file =>
      file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')
    );
    if (csv) setCsvFile(csv);
    if (images.length > 0) setImageFiles(images);
  };

  // callback to update per-file upload status for the progress display
  const handleUploadProgress = (fileName, status) => {
    setUploadStatus(prev => ({ ...prev, [fileName]: status }));
  };

  // main handler for processing all the files
  const handleProcessFiles = async () => {
    if (!imageFiles.length || !csvFile || !prefix) {
      alert('Please upload images and CSV, and provide a prefix.');
      return;
    }
    if (masterJson === null) {
      alert('Still loading master JSON from R2 — please wait a moment and try again.');
      return;
    }

    setIsLoading(true);
    setResults(null);
    setUploadStatus({});

    try {
      const processingPrefix = prefix.endsWith('_') ? prefix : `${prefix}_`;

      // The folder name is the prefix without the trailing underscore
      // e.g. "PROJECT_20250819_" -> "PROJECT_20250819"
      const folder = processingPrefix.replace(/_$/, '');

      // step 1: rename image files based on the prefix
      const renamedImages = await renameImageFiles(imageFiles, processingPrefix);
      if (renamedImages.length === 0) {
        throw new Error("No images matched the expected naming format '###-pano.jpg'.");
      }

      // step 2: upload renamed images to Cloudflare R2 inside the folder
      const urlMap = await uploadFilesToR2(renamedImages, folder, handleUploadProgress);

      // step 3: convert CSV to JSON, embedding the R2 URLs
      const newJsonData = await convertCsvToJson(csvFile, processingPrefix, urlMap);

      // step 4: merge into the master JSON (new data overwrites matching keys)
      const finalJson = mergeJsonData(masterJson, newJsonData);

      // step 5: overwrite pano_data.json on R2 with the merged result
      const jsonPublicUrl = await uploadJsonToR2(finalJson);

      // update local masterJson state so subsequent runs in the same session are correct
      setMasterJson(finalJson);

      setResults({ jsonPublicUrl });
      setIsResultsModalOpen(true);

    } catch (error) {
      console.error('Error processing files:', error);
      alert(`An error occurred: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // count how many files have finished uploading
  const uploadedCount = Object.values(uploadStatus).filter(s => s === 'done').length;
  const totalCount = imageFiles.length;

  return (
    <>
      <Modal
        isOpen={isResultsModalOpen}
        onClose={() => setIsResultsModalOpen(false)}
        title="Processing Complete"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            All {uploadedCount} images have been uploaded to Cloudflare R2.
            Your JSON file has been updated and is live at:
          </p>
          <a
            href={results?.jsonPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full text-center px-4 py-2 rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors break-all"
          >
            {results?.jsonPublicUrl}
          </a>
          <p className="text-xs text-gray-400">
            Your GIS map can point permanently to this URL — it will always reflect the latest data.
          </p>
        </div>
      </Modal>

      <main className="flex flex-col items-center p-5 space-y-4 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold">Pano Sync Processor</h1>

        {/* R2 JSON status indicator */}
        <div className="w-full px-4 py-2 rounded-md border text-sm
          {jsonLoadError
            ? 'bg-red-50 border-red-200 text-red-600'
            : masterJson === null
            ? 'bg-yellow-50 border-yellow-200 text-yellow-600'
            : 'bg-green-50 border-green-200 text-green-700'}">
          {jsonLoadError
            ? `⚠ Could not load master JSON from R2: ${jsonLoadError}`
            : masterJson === null
            ? '⏳ Loading master JSON from R2...'
            : `✓ Master JSON loaded — ${Object.keys(masterJson).length.toLocaleString()} entries`}
        </div>

        <div className="w-full p-4 border rounded-lg bg-gray-50">
          <h2 className="text-xl font-light text-[#2D2D31] mb-2">1. Upload Files</h2>
          <FileUploader
            title="JPG Images & CSV File"
            onFilesSelected={handleFileSelection}
            accept=".jpg,.jpeg,.csv"
            multiple
          />
          <div className="mt-2 space-y-1">
            {csvFile && <p className="text-sm text-pink-600">CSV file loaded: {csvFile.name}</p>}
            {imageFiles.length > 0 && <p className="text-sm text-pink-600">{imageFiles.length} image(s) loaded.</p>}
          </div>
        </div>

        <PrefixInput value={prefix} onChange={setPrefix} />

        {/* upload progress display — only shown during processing */}
        {isLoading && totalCount > 0 && (
          <div className="w-full p-4 border rounded-lg bg-gray-50">
            <h2 className="text-xl font-light text-[#2D2D31] mb-2">
              Uploading to R2... {uploadedCount}/{totalCount}
            </h2>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-[#FD366E] h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (uploadedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <ActionPanel onProcess={handleProcessFiles} isLoading={isLoading} />
      </main>
    </>
  );
}

export default App;
