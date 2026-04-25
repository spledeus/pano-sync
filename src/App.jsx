// src/App.jsx
import { useState } from 'react';
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
import { uploadFilesToR2 } from './lib/r2Upload';

function App() {
  // state for user-uploaded files
  const [imageFiles, setImageFiles] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);

  // state for user input and ui control
  const [prefix, setPrefix] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({}); // tracks per-file upload progress
  const [results, setResults] = useState(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

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
    if (!imageFiles.length || !csvFile || !jsonFile || !prefix) {
      alert('Please upload all files and provide a prefix.');
      return;
    }

    setIsLoading(true);
    setResults(null);
    setUploadStatus({});

    try {
      const processingPrefix = prefix.endsWith('_') ? prefix : `${prefix}_`;

      // step 1: read the existing master JSON
      const existingJsonText = await jsonFile.text();
      const existingJson = JSON.parse(existingJsonText);

      // step 2: rename image files based on the prefix
      const renamedImages = await renameImageFiles(imageFiles, processingPrefix);
      if (renamedImages.length === 0) {
        throw new Error("No images matched the expected naming format '###-pano.jpg'.");
      }

      // step 3: upload renamed images directly to Cloudflare R2
      // urlMap is a Map of { filename -> full public URL }
      const urlMap = await uploadFilesToR2(renamedImages, handleUploadProgress);

      // step 4: convert CSV to JSON, embedding the R2 URLs
      const newJsonData = await convertCsvToJson(csvFile, processingPrefix, urlMap);

      // step 5: merge into the master JSON
      const finalJson = mergeJsonData(existingJson, newJsonData);

      // step 6: make the updated JSON available for download
      const jsonBlob = new Blob([JSON.stringify(finalJson, null, 2)], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);

      setResults({ jsonUrl });
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
            Download your updated JSON file below.
          </p>
          <a
            href={results?.jsonUrl}
            download="pano_data.json"
            className="w-full text-center px-4 py-2 rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors"
          >
            Download Updated JSON
          </a>
        </div>
      </Modal>

      <main className="flex flex-col items-center p-5 space-y-4 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold">Pano Sync Processor</h1>

        <div className="w-full p-4 border rounded-lg bg-gray-50">
          <h2 className="text-xl font-light text-[#2D2D31] mb-2">1. Upload Files</h2>
          <div className="space-y-4">
            <div>
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

            <div>
              <FileUploader
                title="Existing JSON Data"
                onFilesSelected={(files) => setJsonFile(files[0])}
                accept=".json"
              />
              <div className="mt-2 space-y-1">
                {jsonFile && <p className="text-sm text-pink-600">JSON file loaded: {jsonFile.name}</p>}
              </div>
            </div>
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
