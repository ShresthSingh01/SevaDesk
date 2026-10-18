/**
 * SevaDesk Client-Side Document Optimizer
 * 
 * Provides 100% on-device HTML5 Canvas downsampling & JPEG quantization to compress
 * citizen identity card and marksheet scans to meet strict state portal upload limits
 * (e.g., < 100 KB or < 200 KB) without uploading documents to external cloud services.
 */

export interface OptimizationResult {
  originalFile: File;
  optimizedFile: File;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  reductionPercentage: number;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function optimizeImageForPortal(
  file: File,
  targetMaxMB: number = 0.20 // Default 200 KB cap standard in Indian portals
): Promise<OptimizationResult> {
  const targetMaxBytes = Math.floor(targetMaxMB * 1024 * 1024);

  // If already below target size and an accepted format, return as-is
  if (file.size <= targetMaxBytes && (file.type === 'image/jpeg' || file.type === 'image/png')) {
    return {
      originalFile: file,
      optimizedFile: file,
      originalSizeBytes: file.size,
      optimizedSizeBytes: file.size,
      reductionPercentage: 0,
      originalDimensions: { width: 0, height: 0 },
      optimizedDimensions: { width: 0, height: 0 }
    };
  }

  // Load into Image element
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for client-side optimization.'));
    img.src = objectUrl;
  });

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  // Scale down dimensions if huge (e.g., raw smartphone camera scan > 1800px)
  let maxDim = 1600;
  let curWidth = origWidth;
  let curHeight = origHeight;

  if (curWidth > maxDim || curHeight > maxDim) {
    if (curWidth > curHeight) {
      curHeight = Math.round((curHeight * maxDim) / curWidth);
      curWidth = maxDim;
    } else {
      curWidth = Math.round((curWidth * maxDim) / curHeight);
      curHeight = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Canvas 2D context unavailable.');
  }

  canvas.width = curWidth;
  canvas.height = curHeight;

  // Draw with white background (in case of transparent PNGs)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, curWidth, curHeight);
  ctx.drawImage(img, 0, 0, curWidth, curHeight);

  // Binary search for highest quality that satisfies targetMaxBytes
  let lowQuality = 0.25;
  let highQuality = 0.92;
  let bestBlob: Blob | null = null;
  let attempts = 0;

  while (attempts < 5) {
    const midQuality = (lowQuality + highQuality) / 2;
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', midQuality));

    if (!blob) break;

    if (blob.size <= targetMaxBytes) {
      bestBlob = blob;
      lowQuality = midQuality; // try higher quality
    } else {
      highQuality = midQuality; // need more compression
    }
    attempts++;
  }

  // If still oversized after quality search, downscale dimensions by 25% and compress
  if (!bestBlob || bestBlob.size > targetMaxBytes) {
    canvas.width = Math.round(curWidth * 0.75);
    canvas.height = Math.round(curHeight * 0.75);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    bestBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.60));
  }

  URL.revokeObjectURL(objectUrl);

  const finalBlob = bestBlob || file;
  const cleanBaseName = file.name.replace(/\.[^/.]+$/, '');
  const optimizedFile = new File([finalBlob], `${cleanBaseName}_optimized.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });

  const reduction = Math.max(0, Math.round(((file.size - optimizedFile.size) / file.size) * 100));

  return {
    originalFile: file,
    optimizedFile,
    originalSizeBytes: file.size,
    optimizedSizeBytes: optimizedFile.size,
    reductionPercentage: reduction,
    originalDimensions: { width: origWidth, height: origHeight },
    optimizedDimensions: { width: canvas.width, height: canvas.height }
  };
}
