import { requestFeeSpeechWav, requestReadbackSpeechWav } from './api';

export interface OcrReadbackFields {
  fullName?: string;
  dob?: string;
  gender?: string;
  pincode?: string;
  maskedId?: string;
}

export function getFeeDisclosureText(
  serviceName: string,
  officialFee: number | null | undefined,
  operatorCharge: number | null | undefined,
  langCode: string = 'hi-IN'
): string {
  const offStr = officialFee !== null && officialFee !== undefined ? `${officialFee.toFixed(2)}` : 'तय नहीं है';
  const opStr = operatorCharge !== null && operatorCharge !== undefined ? `${operatorCharge.toFixed(2)}` : 'तय नहीं है';
  const tot = (officialFee ?? 0) + (operatorCharge ?? 0);
  const totStr = officialFee !== null && operatorCharge !== null && officialFee !== undefined && operatorCharge !== undefined
    ? `${tot.toFixed(2)}`
    : 'तय नहीं है';

  const prefix = langCode.split('-')[0].toLowerCase();

  switch (prefix) {
    case 'hi':
      return `इस सेवा का नाम ${serviceName} है। सरकारी पोर्टल शुल्क: ${offStr} रुपये। केंद्र सेवा शुल्क: ${opStr} रुपये। कुल देय राशि: ${totStr} रुपये। कृपया भुगतान से पहले आधिकारिक पोर्टल पर शुल्क की पुष्टि करें।`;
    case 'mr':
      return `या सेवेचे नाव ${serviceName} आहे. सरकारी पोर्टल शुल्क: ${offStr} रुपये. केंद्र सेवा शुल्क: ${opStr} रुपये. एकूण देय रक्कम: ${totStr} रुपये. कृपया पैसे देण्यापूर्वी अधिकृत पोर्टलवर शुल्क तपासा.`;
    case 'ta':
      return `இந்த சேவையின் பெயர் ${serviceName}. அரசு இணையதளக் கட்டணம்: ${offStr} ரூபாய். மைய சேவை கட்டணம்: ${opStr} ரூபாய். மொத்த தொகை: ${totStr} ரூபாய். பணம் செலுத்துவதற்கு முன் இணையதளத்தில் உறுதிப்படுத்துங்கள்.`;
    case 'te':
      return `ఈ సేవ పేరు ${serviceName}. ప్రభుత్వ పోర్టల్ రుసుము: ${offStr} రూపాయలు. కేంద్ర సేవా ఛార్జీ: ${opStr} రూపాయలు. మొత్తం: ${totStr} రూపాయలు. చెల్లించే ముందు పోర్టల్‌లో నిర్ధారించండి.`;
    case 'bn':
      return `এই পরিষেবার নাম ${serviceName}। সরকারি পোর্টাল ফি: ${offStr} টাকা। কেন্দ্রের পরিষেবা চার্জ: ${opStr} টাকা। মোট প্রদেয়: ${totStr} টাকা।`;
    case 'gu':
      return `આ સેવાનું નામ ${serviceName} છે. સરકારી પોર્ટલ ફી: ${offStr} રૂપિયા. કેન્દ્ર સેવા ચાર્જ: ${opStr} રૂપિયા. કુલ રકમ: ${totStr} રૂપિયા.`;
    default:
      return `The service is ${serviceName}. Official government portal fee: ${offStr} rupees. Kiosk operator service charge: ${opStr} rupees. Total payable: ${totStr} rupees. Please verify the official fee before payment.`;
  }
}

export async function playFeeSpeech(
  serviceName: string,
  officialFee: number | null | undefined,
  operatorCharge: number | null | undefined,
  langCode: string = 'hi-IN',
  preferDaemon: boolean = false
): Promise<void> {
  const text = getFeeDisclosureText(serviceName, officialFee, operatorCharge, langCode);

  // If browser SpeechSynthesis is available, it provides immediate offline Indic voice
  if ('speechSynthesis' in window && !preferDaemon) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;

    // Pick best matching voice
    const voices = window.speechSynthesis.getVoices();
    const prefix = langCode.split('-')[0].toLowerCase();
    const match = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (match) {
      utterance.voice = match;
    }

    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    return;
  }

  // Fallback to local daemon WAV synthesis
  const blob = await requestFeeSpeechWav(serviceName, officialFee, operatorCharge, langCode);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await audio.play();
}

export function getOcrReadbackText(
  fields: OcrReadbackFields,
  langCode: string = 'hi-IN'
): string {
  const name = fields.fullName?.trim() || 'नागरिक';
  const dob = fields.dob?.trim();
  const pin = fields.pincode?.trim();
  const id = fields.maskedId?.trim();
  const prefix = langCode.split('-')[0].toLowerCase();

  switch (prefix) {
    case 'hi': {
      let t = `पहचान सत्यापन: आपके दस्तावेज़ से नाम ${name}`;
      if (dob) t += `, जन्म तिथि ${dob}`;
      if (pin) t += `, पिन कोड ${pin}`;
      if (id) t += `, पहचान संख्या ${id}`;
      t += ` पढ़ा गया है। कृपया पुष्टि करें कि यह जानकारी सही है।`;
      return t;
    }
    case 'mr': {
      let t = `ओळख पडताळणी: आपल्या कागदपत्रावरून नाव ${name}`;
      if (dob) t += `, जन्मतारीख ${dob}`;
      if (pin) t += `, पिन कोड ${pin}`;
      t += ` वाचले आहे. ही माहिती बरोबर आहे का?`;
      return t;
    }
    case 'ta': {
      let t = `அடையாள சரிபார்ப்பு: உங்கள் ஆவணத்திலிருந்து பெயர் ${name}`;
      if (dob) t += `, பிறந்த தேதி ${dob}`;
      if (pin) t += `, அஞ்சல் குறியீடு ${pin}`;
      t += ` படிக்கப்பட்டுள்ளது. இந்த விவரங்கள் சரியானவையா?`;
      return t;
    }
    case 'te': {
      let t = `గుర్తింపు ధృవీకరణ: మీ పత్రం నుండి పేరు ${name}`;
      if (dob) t += `, పుట్టిన తేదీ ${dob}`;
      if (pin) t += `, పిన్ కోడ్ ${pin}`;
      t += ` చదవబడింది. ఈ వివరాలు సరైనవేనా?`;
      return t;
    }
    case 'bn': {
      let t = `পরিচয় যাচাইকরণ: আপনার নথি থেকে নাম ${name}`;
      if (dob) t += `, জন্ম তারিখ ${dob}`;
      if (pin) t += `, পিন কোড ${pin}`;
      t += ` পড়া হয়েছে। এই তথ্য কি সঠিক?`;
      return t;
    }
    case 'gu': {
      let t = `ઓળખ ચકાસણી: તમારા દસ્તાવેજમાંથી નામ ${name}`;
      if (dob) t += `, જન્મ તારીખ ${dob}`;
      if (pin) t += `, પિન કોડ ${pin}`;
      t += ` વાંચવામાં આવ્યું છે. શું આ વિગતો સાચી છે?`;
      return t;
    }
    default: {
      let t = `Identity verification: From your document, we have read Name: ${name}`;
      if (dob) t += `, Date of Birth: ${dob}`;
      if (pin) t += `, PIN code: ${pin}`;
      if (id) t += `, ID number ${id}`;
      t += `. Please confirm if these details are correct.`;
      return t;
    }
  }
}

export async function playOcrReadbackSpeech(
  fields: OcrReadbackFields,
  langCode: string = 'hi-IN',
  preferDaemon: boolean = false
): Promise<void> {
  const text = getOcrReadbackText(fields, langCode);

  if ('speechSynthesis' in window && !preferDaemon) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;

    const voices = window.speechSynthesis.getVoices();
    const prefix = langCode.split('-')[0].toLowerCase();
    const match = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (match) {
      utterance.voice = match;
    }

    utterance.rate = 0.92;
    return new Promise((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  // Fallback to local daemon WAV synthesis
  try {
    const blob = await requestReadbackSpeechWav(fields.fullName, fields.dob, fields.pincode, fields.maskedId, langCode);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } catch (err) {
    console.warn('Readback speech audio fallback error:', err);
  }
}
