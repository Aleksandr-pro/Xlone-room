declare global {
  interface Window {
    AndroidBridge?: {
      saveBase64File(fileName: string, mimeType: string, base64Data: string): void;
      showToast(message: string): void;
      getAppVersion(): string;
    };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function saveFileToDevice(filename: string, data: BlobPart | Uint8Array, mime: string): void {
  if (typeof window !== 'undefined' && window.AndroidBridge?.saveBase64File) {
    if (typeof data === 'string') {
      const bytes = new TextEncoder().encode(data);
      window.AndroidBridge.saveBase64File(filename, mime, bytesToBase64(bytes));
      return;
    }
    if (data instanceof Uint8Array) {
      window.AndroidBridge.saveBase64File(filename, mime, bytesToBase64(data));
      return;
    }
    if (data instanceof ArrayBuffer) {
      window.AndroidBridge.saveBase64File(filename, mime, bytesToBase64(new Uint8Array(data)));
      return;
    }
  }

  const blob = new Blob([data instanceof Uint8Array ? new Uint8Array(data).buffer : data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function saveDataUrlToDevice(filename: string, dataUrl: string, mime = 'image/png'): void {
  if (typeof window !== 'undefined' && window.AndroidBridge?.saveBase64File) {
    const idx = dataUrl.indexOf(',');
    if (idx >= 0) {
      window.AndroidBridge.saveBase64File(filename, mime, dataUrl.slice(idx + 1));
      return;
    }
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
