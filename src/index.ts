import { AdbDaemonWebUsbDeviceObserver} from "@yume-chan/adb-daemon-webusb";
import { Adb, AdbSync } from "@yume-chan/adb";
import { ReadableStream, TextDecoderStream, WritableStream } from "@yume-chan/stream-extra";
import { PackageManager } from "@yume-chan/android-bin";

import {getDeviceState, setDeviceState, connectToDevice, disconnectDevice, initializeCredentials} from "./state";

const statusDiv = document.getElementById('status')!;
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const uploadSection = document.getElementById('uploadSection')!;
const uploadArea = document.getElementById('uploadArea')!;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const statusText = document.getElementById('statusText')!;
const fileList = document.getElementById('fileList')!;
let fileInput = document.getElementById('fileInput') as HTMLInputElement;
const uninstallSection = document.getElementById('uninstallSection') as HTMLDivElement;
const appList = document.getElementById('appList') as HTMLSelectElement;
const uninstallBtn = document.getElementById('uninstallBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;

// Browser compatibility check
if (!navigator.usb) {
  statusDiv.textContent = 'WebUSB not supported. Use Chromium-based browsers.';
  statusDiv.className = 'status disabled';
  connectBtn.disabled = true;
}

// State management
let observer: AdbDaemonWebUsbDeviceObserver | null = null;
let selectedFiles: File[] = [];
const UPLOAD_PATH = '/sdcard/Downloads/web-uploads/';

interface ProcessOutput {
  output: string;
  exitCode: number;
}

function updateStatus() {
  const state = getDeviceState();

  if (state.device) {
    if (state.isAuthenticating) {
      statusDiv.textContent = 'Authentication required. Check your device...';
      statusDiv.className = 'status authenticating';
    } else if (state.isConnected) {
      statusDiv.textContent = 'ADB enabled - Device connected';
      statusDiv.className = 'status enabled';
    } else if (state.error) {
      statusDiv.textContent = state.error;
      statusDiv.className = 'status error';
    } else {
      statusDiv.textContent = 'Device detected - Connecting...';
      statusDiv.className = 'status connecting';
    }

    uploadSection.style.display = 'block';
    uninstallSection.style.display = 'block';

    // Load apps only when fully connected
    if (state.isConnected && !state.isAuthenticating) {
      loadInstalledApps();
    }
  } else {
    statusDiv.textContent = 'No ADB device connected';
    statusDiv.className = 'status disabled';
    uploadSection.style.display = 'none';
    uninstallSection.style.display = 'none';
    selectedFiles = [];
    renderFileList();
  }

  // Show error if any
  if (state.error) {
    statusText.textContent = state.error;
    statusText.className = 'status-text error';
  }
}

// Initialize device observer
async function initializeObserver() {
  try {
    observer = await AdbDaemonWebUsbDeviceObserver.create(navigator.usb, {
      filters: [{ vendorId: 0x18d1 }] // Google's vendor ID
    });

    const hasDevices = observer.current.length > 0;
    if(hasDevices) {
      setDeviceState({ device: observer.current[0] });
    }
    updateStatus();

    // Listen for device list changes
    observer.onListChange(devices => {
      const hasDevices = devices.length > 0;
      if (hasDevices) {
        setDeviceState({ device: devices[0]});
      } else {
        disconnectDevice();
      }
      updateStatus();
    });

    observer.onDeviceAdd(devices => {
      console.log('Device connected:', devices);
    });

    observer.onDeviceRemove(devices => {
      console.log('Device disconnected:', devices);
    });

    // TODO not really needed
    return observer;
  } catch (error) {
    console.error('Observer initialization failed:', error);
    setDeviceState({ error: 'Failed to initialize device observer' });
    updateStatus();
    return null;
  }
}

// File selection handling
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  console.log('[DEBUG] File input change event triggered');

  if (!fileInput.files || fileInput.files.length === 0) {
    console.log('[DEBUG] No files selected');
    return;
  }

  // Create a new array from the files
  selectedFiles = [];
  for (let i = 0; i < fileInput.files.length; i++) {
    selectedFiles.push(fileInput.files[i]);
  }

  console.log(`[DEBUG] Selected ${selectedFiles.length} files`);
  renderFileList();
  uploadBtn.disabled = false;

});

// Reset the input only after successful upload
function resetFileInput() {
  // Create a new input element to replace the old one
  const newInput = document.createElement('input');
  newInput.type = 'file';
  newInput.id = 'fileInput';
  newInput.multiple = true;
  newInput.style.display = 'none';

  // Add event listener to the new input
  newInput.addEventListener('change', () => {
    if (!newInput.files || newInput.files.length === 0) return;
    selectedFiles = Array.from(newInput.files);
    renderFileList();
    uploadBtn.disabled = false;
  });

  // Replace the old input with the new one
  const parent = fileInput.parentNode;
  parent?.replaceChild(newInput, fileInput);
  fileInput = newInput as HTMLInputElement;

  // Also reset the selectedFiles array
  selectedFiles = [];
  renderFileList();
  uploadBtn.disabled = true;
}


uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');

  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
    console.log('[DEBUG] No files in drop event');
    return;
  }

  console.log(`[DEBUG] Dropped ${e.dataTransfer.files.length} files`);

  // Create a new array from the dropped files
  selectedFiles = [];
  for (let i = 0; i < e.dataTransfer.files.length; i++) {
    selectedFiles.push(e.dataTransfer.files[i]);
  }

  renderFileList();
  uploadBtn.disabled = false;
});

function renderFileList() {
  fileList.innerHTML = '';

  if (selectedFiles.length === 0) {
    fileList.innerHTML = '<p>No files selected</p>';
    return;
  }

  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
      <div class="file-name">${file.name}</div>
      <div class="file-size">${formatFileSize(file.size)}</div>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn';
    removeBtn.style.backgroundColor = '#dc3545';
    removeBtn.style.padding = '5px 10px';
    removeBtn.style.fontSize = '0.9rem';
    removeBtn.addEventListener('click', () => {
      selectedFiles.splice(index, 1);
      renderFileList();
      uploadBtn.disabled = selectedFiles.length === 0;
    });

    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    fileList.appendChild(fileItem);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// Upload functionality
uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const state = getDeviceState();
  const client = state.client;
  if(!client) return;


  try {
    // Connect to device if not already connected
    // Get ADB sync client
    const sync = await client.sync();

    // Check if we are installing APKs
    const isApkInstall = selectedFiles.every(file => file.name.toLowerCase().endsWith('.apk'))

    if (isApkInstall) {
      if (selectedFiles.length === 1) {
        await installSingleApk(client, selectedFiles[0]);
      } else {
        await installSplitApk(client, sync, selectedFiles);
      }

      statusText.textContent = 'App installed successfully!';
      statusText.className = 'status-text success';
    } else {
    // Upload all files
      for (const file of selectedFiles) {
        await uploadFile(sync, file);
      }

      statusText.textContent = 'All files uploaded successfully!';
      statusText.className = 'status-text success';
      resetFileInput();
    }

  } catch (error) {
    console.error('Upload error:', error);
    statusText.textContent = `Upload failed: ${error instanceof Error ? error.message : String(error)}`;
    statusText.className = 'status-text error';
  } finally {
    progressBar.style.width = '0%';
  }
});

async function uploadFile(sync: AdbSync, file: File) {
  if (!file || file.size === 0) {
    console.error('[DEBUG] Invalid file reference', file);
    throw new Error('Invalid file reference');
  }

  console.log(`[DEBUG] Starting upload for: ${file.name} (${file.size} bytes)`);

  statusText.textContent = `Uploading: ${file.name}...`;
  statusText.className = 'status-text';
  progressBar.style.width = '0%';

  const filePath = `${UPLOAD_PATH}${file.name}`;
  const fileSize = file.size;
  let uploaded = 0;

  try {
    // Create readable stream from the file

    const fileStream = file.stream();
    const progressTrackingStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = fileStream.getReader();
        while(true) {
          const {done, value} = await reader.read();
          if(done) {
            controller.close();
            break;
          }

          // Track uploaded bytes
          uploaded += value.byteLength;
          const progress = Math.round((uploaded / fileSize) * 100);
          progressBar.style.width = `${progress}%`;

          // Pass through the data
          controller.enqueue(value);
        }
      }
    });

    await sync.write({
      filename: filePath,
      file: progressTrackingStream,
    });

    console.log(`File uploaded: ${file.name}`);

    statusText.textContent = `Uploaded: ${file.name}`;
    statusText.className = 'status-text success';
  } catch (error) {
    console.error(`Error uploading ${file.name}:`, error);
    statusText.textContent = `Error uploading ${file.name}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    statusText.className = 'status-text error';
    throw error;
  }
}

async function installSingleApk(client: Adb, apkFile: File) {
  statusText.textContent = `Installing: ${apkFile.name}...`;
  statusText.className = 'status-text';
  let uploaded = 0;

  try {
    const stream = apkFile.stream();
    const apkSize = apkFile.size;
    const pm = new PackageManager(client);

    // Create readable stream from APK
    const progressTrackingStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.getReader();
        while(true) {
          const {done, value} = await reader.read();
          if(done) {
            controller.close();
            break;
          }

          // Track uploaded bytes
          uploaded += value.byteLength;
          const progress = Math.round((uploaded / apkSize) * 100);
          progressBar.style.width = `${progress}%`;

          // Pass through the data
          controller.enqueue(value);
        }

      }
    });
    // Feed into pm installer
    await pm.installStream(apkSize, progressTrackingStream);
  } catch(error) {
    console.error('Installation error:', error);
    statusText.textContent = `Installation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    statusText.className = 'status-text error';
    throw error;
  }
}

async function installSplitApk(client: Adb, sync: AdbSync, apkFiles: File[]) {
  console.log("Client: ", client);
  console.log("Sync status: ", sync);
  console.log("Files: ", apkFiles);
  statusText.textContent = 'Split APK Not Implemented, TODO!';
  statusText.className = 'status-text not implemented';
}

/** =============================
 *        REINSTALL APK
 *  =============================
 */

async function loadInstalledApps() {
  let adbClient: Adb | null = null;

  const state = getDeviceState();
  if(state.client) {
    adbClient = state.client;
  } else {
    console.log("[+] Load Installed apps called without connected client");
    return;
  }

  appList.innerHTML = '<option value="" disabled selected>Loading applications...</option>';
  uninstallBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    // Directly use pm -3 for third-party apps
    const adbCommand = ['pm', 'list', 'packages', '-3'];
    const {output, exitCode}  = await adbRun(adbClient!, adbCommand);

    if (exitCode !== 0) {
      throw new Error('Failed to list applications');
    }

    // Parse package names, pm ouput include package:
    const packages = output.split('\n')
      .filter(line => line.startsWith('package:'))
      .map(line => line.substring(8).trim());

    if (packages.length === 0) {
      appList.innerHTML = '<option value="" disabled>No third-party apps found</option>';
      return;
    }

    // Clear and populate app list
    appList.innerHTML = '';
    packages.forEach(pkg => {
      const option = document.createElement('option');
      option.value = pkg;
      option.textContent = pkg;
      appList.appendChild(option);
    });

    // Enable controls
    uninstallBtn.disabled = false;
    refreshBtn.disabled = false;

  } catch (error) {
    console.error('Error loading applications:', error);
    appList.innerHTML = '<option value="" disabled>Error loading applications</option>';
  }
}

async function uninstallSelectedApp() {
  const packageName = appList.value;
  if (!packageName) return;
  let adbClient: Adb | null = null;

  const state = getDeviceState();
  if(state.client) {
    adbClient = state.client;
  } else {
    console.log("[+] Load Installed apps called without connected client");
    return;
  }

  uninstallBtn.disabled = true;
  refreshBtn.disabled = true;
  statusText.textContent = `Uninstalling ${packageName}...`;
  statusText.className = 'status-text';

  try {
    const adbCommand = ['pm', 'uninstall', packageName];
    const {output, exitCode} = await adbRun(adbClient!, adbCommand);

    if (exitCode !== 0) {
      throw new Error(`Uninstall failed: ${output}`);
    }

    statusText.textContent = `Uninstalled: ${packageName}`;
    statusText.className = 'status-text success';

    // Refresh app list
    await loadInstalledApps();

  } catch (error) {
    console.error('Uninstall error:', error);
    statusText.textContent = `Uninstall failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    statusText.className = 'status-text error';
    uninstallBtn.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function adbRun(adbClient: Adb, command: string | readonly string[]) : Promise<ProcessOutput> {
  let ret: ProcessOutput = {
    output: "",
    exitCode: 0
  };

  const shell = await adbClient.subprocess.shellProtocol!.spawn(command);
  // Stdout and stderr will generate two Promise, await them together
  await Promise.all([
    shell.stdout.pipeThrough(new TextDecoderStream()).pipeTo(
      new WritableStream({
        write(chunk) {
         ret.output = chunk;
        },
      }),
    ),
    shell.stderr.pipeThrough(new TextDecoderStream()).pipeTo(
      new WritableStream({
        write(chunk) {
          console.error(["[*] PM LIST ERR ", chunk]);
        },
      }),
    ),
  ]);

  ret.exitCode = await shell.exited;
  return ret;
}

refreshBtn.addEventListener('click', loadInstalledApps);
uninstallBtn.addEventListener('click', uninstallSelectedApp);
appList.addEventListener('change', () => {
  uninstallBtn.disabled = !appList.value;
});


// Manual device connection trigger
connectBtn.addEventListener('click', async () => {
  try {
    // Must be triggered by user gesture
    await navigator.usb.requestDevice({
      filters: [{ vendorId: 0x18d1 }] // Google's vendor ID
    });
    // Simple solution: only connect to device calls this function
    connectToDevice();
  } catch (error) {
    console.log('Device selection canceled');
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', async () => {
  if (observer) {
    observer.stop(); // Release resources
  }

  const state = getDeviceState();
  if(state.device) {
    disconnectDevice();
  }
});

// Initialize device credentials
initializeCredentials();
// Initialize device observer
initializeObserver();
// Periodically update UI to reflect state changes
setInterval(updateStatus, 10000);
