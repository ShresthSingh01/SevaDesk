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

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file as DataURL.'));
    reader.readAsDataURL(file);
  });
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

  // Adjust initial dimension cap based on target limit
  let maxDim = targetMaxBytes <= 50 * 1024 ? 480 : targetMaxBytes <= 120 * 1024 ? 1000 : 1400;
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
  let ctx = canvas.getContext('2d');
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
  let lowQuality = 0.20;
  let highQuality = 0.92;
  let bestBlob: Blob | null = null;
  let attempts = 0;

  while (attempts < 6) {
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

  // If still oversized after quality search, iteratively downscale dimensions until under cap
  let scale = 0.80;
  while ((!bestBlob || bestBlob.size > targetMaxBytes) && canvas.width > 200 && canvas.height > 200) {
    canvas.width = Math.round(canvas.width * scale);
    canvas.height = Math.round(canvas.height * scale);
    ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    bestBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.65));
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

/**
 * Generates an authentic, high-resolution simulated certificate scan for end-to-end testing.
 * Visual elements include official government headers, verification seal, Tehsil signatures, and QR code.
 */
export async function createSampleDocument(
  filename = 'income_declaration_mawanta_tehsil.jpg',
  title = 'आय प्रमाण पत्र (Income Certificate)'
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new File(['Mock valid document'], filename, { type: 'image/jpeg' });
  }

  // Realistic paper background
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Official double border
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
  ctx.lineWidth = 1;
  ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

  // Top Govt Seal
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 125, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SEVA', canvas.width / 2, 132);

  // Headers
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px serif';
  ctx.fillText('GOVERNMENT OF UTTAR PRADESH', canvas.width / 2, 205);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#b45309';
  ctx.fillText(title, canvas.width / 2, 245);

  // Text content
  ctx.fillStyle = '#334155';
  ctx.font = '17px sans-serif';
  ctx.textAlign = 'left';

  const certLines = [
    'Electronic Reference: UP-EDIST-2026-984210',
    `Date of Issuance: ${new Date().toLocaleDateString('en-IN')}`,
    'Issuing Authority: Sub-Divisional Magistrate (SDM), Mawana Tehsil',
    '----------------------------------------------------------------------------------',
    'Applicant Details:',
    '  • Full Name: Ramesh Chandra Verma',
    '  • Guardian / Father: Shri Ramswaroop Verma',
    '  • Permanent Address: Vill-Mawana Kalan, Mawana, Meerut, UP - 250401',
    '  • Social Category: Other Backward Class (OBC)',
    '  • Verified Annual Family Income: Rs. 64,000/- (Sixty-Four Thousand Only)',
    '  • Income Source: Agriculture & Small Village Enterprise',
    '----------------------------------------------------------------------------------',
    'Security Notice: Valid for all official welfare & scholarship schemes across Uttar Pradesh.',
    'Any alteration to this digital document renders it completely null and void.'
  ];

  certLines.forEach((l, i) => {
    ctx.fillText(l, 80, 310 + (i * 32));
  });

  // Official Red Seal & Stamp
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(canvas.width - 200, canvas.height - 180, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED & STAMPED', canvas.width - 200, canvas.height - 185);
  ctx.fillText('TEHSILDAR MAWANA', canvas.width - 200, canvas.height - 165);

  // Simulated QR Code
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(80, canvas.height - 240, 120, 120);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(90, canvas.height - 230, 35, 35);
  ctx.fillRect(155, canvas.height - 230, 35, 35);
  ctx.fillRect(90, canvas.height - 165, 35, 35);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(98, canvas.height - 222, 18, 18);
  ctx.fillRect(163, canvas.height - 222, 18, 18);
  ctx.fillRect(98, canvas.height - 157, 18, 18);

  // Add realistic visual grain / noise so initial camera scan is ~1.5 - 2.5 MB uncompressed
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;
    d[i] = Math.min(255, Math.max(0, d[i] + noise));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + noise));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise(res => {
    canvas.toBlob(blob => {
      res(new File([blob!], filename, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.98);
  });
}

/**
 * Generates an authentic simulated passport photo scan for end-to-end testing.
 */
export async function createSamplePhoto(filename = 'applicant_passport_photo.jpg'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new File(['Mock photo data'], filename, { type: 'image/jpeg' });
  }

  // Light studio blue background
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Shoulders / torso
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(300, 750, 220, 160, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.ellipse(300, 420, 130, 170, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(300, 360, 140, Math.PI, 0);
  ctx.fill();

  // White border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Photo noise
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 26;
    d[i] = Math.min(255, Math.max(0, d[i] + noise));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + noise));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise(res => {
    canvas.toBlob(blob => {
      res(new File([blob!], filename, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.98);
  });
}

/**
 * Generates an authentic simulated signed declaration paper scan for end-to-end testing.
 * Includes official bilingual header, citizen particulars pre-filled, blue ink signature,
 * date, and tracking QR code, auto-compressed to <= 100 KB.
 */
export async function createSignedProformaScan(
  citizen: { fullName?: string; fatherName?: string; address?: string; district?: string; state?: string; mobile?: string },
  service?: { name?: string; department?: string },
  proformaTitle: string = 'स्वप्रमाणित घोषणा पत्र (Self-Declaration Form)'
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  const filename = `self_declaration_${(citizen.fullName || 'applicant').toLowerCase().replace(/[^a-z0-9]/g, '_')}_signed.jpg`;
  
  if (!ctx) {
    return new File(['Mock signed proforma'], filename, { type: 'image/jpeg' });
  }

  // Realistic paper white/ivory
  ctx.fillStyle = '#fbfbfa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  // Emblem placeholder
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'center';
  ctx.fillText('उत्तर प्रदेश शासन / GOVERNMENT OF UTTAR PRADESH', canvas.width / 2, 100);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(service?.department || 'राजस्व विभाग (Revenue Department)', canvas.width / 2, 130);

  // Title Box
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(proformaTitle, canvas.width / 2, 185);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(100, 210);
  ctx.lineTo(canvas.width - 100, 210);
  ctx.stroke();

  // Content Paragraphs
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'left';
  ctx.font = '18px sans-serif';

  const applicantName = citizen.fullName || 'राकेश कुमार (Ramesh Kumar)';
  const address = citizen.address || 'वार्ड 4, बिलासपुर (Ward 4, Bilaspur)';
  const district = citizen.district || 'गाजियाबाद (Ghaziabad)';
  const state = citizen.state || 'उत्तर प्रदेश (Uttar Pradesh)';

  const lines = [
    `१. मैं, ${applicantName}, घोषणा करता/करती हूँ कि मैं ${state} का मूल निवासी हूँ।`,
    `२. मेरा स्थायी निवास पता: ${address}, जिला: ${district} है।`,
    `३. यह स्वप्रमाणित घोषणा पत्र "${service?.name || 'आय/जाति प्रमाण पत्र'}" के ऑनलाइन आवेदन हेतु प्रस्तुत है।`,
    `४. मेरे परिवार की समस्त स्रोतों से कुल वार्षिक आय रु. 64,000/- (चौंसठ हजार रुपये) मात्र है।`,
    `५. मेरे द्वारा दी गई समस्त जानकारी मेरी व्यक्तिगत जानकारी एवं विश्वास के अनुसार सत्य एवं सही है।`,
    `६. यदि कोई भी विवरण असत्य या भ्रामक पाया जाता है तो मेरे विरुद्ध विधिक कार्यवाही मान्य होगी।`
  ];

  lines.forEach((line, idx) => {
    ctx.fillText(line, 80, 270 + (idx * 55));
  });

  // Date and Place
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(`दिनांक (Date): ${new Date().toLocaleDateString('en-IN')}`, 80, 680);
  ctx.fillText(`स्थान (Place): ${district}`, 80, 715);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`SevaDesk Case Ref: SD-${Date.now().toString(36).toUpperCase()}`, 80, 750);

  // Signature Box (Right)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width - 450, 630, 370, 160);
  ctx.fillStyle = '#475569';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('आवेदक के हस्ताक्षर / अंगूठे का निशान', canvas.width - 265, 775);

  // Simulated Blue Pen Signature
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(canvas.width - 400, 720);
  ctx.bezierCurveTo(canvas.width - 360, 660, canvas.width - 320, 740, canvas.width - 270, 680);
  ctx.bezierCurveTo(canvas.width - 230, 650, canvas.width - 190, 730, canvas.width - 140, 690);
  ctx.stroke();

  // Thumbprint impression (Red ink)
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(canvas.width - 400, 690, 22, 32, 0.2, 0, Math.PI * 2);
  ctx.stroke();

  // QR Code Box (Left Bottom)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(80, 820, 130, 130);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(90, 830, 40, 40);
  ctx.fillRect(160, 830, 40, 40);
  ctx.fillRect(90, 900, 40, 40);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(100, 840, 20, 20);
  ctx.fillRect(170, 840, 20, 20);
  ctx.fillRect(100, 910, 20, 20);

  // Kiosk Seal
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 880, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('JAN SEVA KENDRA', canvas.width / 2, 875);
  ctx.fillText('VERIFIED PROFORMA', canvas.width / 2, 892);

  const rawBlob: Blob = await new Promise(res => {
    canvas.toBlob(blob => res(blob!), 'image/jpeg', 0.95);
  });
  const rawFile = new File([rawBlob], filename, { type: 'image/jpeg' });

  // Auto-compress to strictly <= 100 KB
  const result = await optimizeImageForPortal(rawFile, 0.095);
  return result.optimizedFile;
}

