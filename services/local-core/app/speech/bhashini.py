import os
import io
import math
import wave
import struct
import hashlib
import requests
from pathlib import Path
from typing import Optional, Dict
from ..core.config import settings

def generate_beep_wav(duration_s: float = 0.5, freq: float = 440.0) -> bytes:
    """Generates an offline audible chime wave bytes if offline and cloud TTS unavailable."""
    sample_rate = 16000
    num_samples = int(sample_rate * duration_s)
    buffer = io.BytesIO()
    with wave.open(buffer, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(num_samples):
            t = float(i) / sample_rate
            value = int(32767.0 * 0.3 * math.sin(2.0 * math.pi * freq * t))
            wav.writeframesraw(struct.pack('<h', value))
    return buffer.getvalue()

class BhashiniSpeechService:
    def __init__(self):
        self.cache_dir = Path(settings.AUDIO_CACHE_PATH)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.api_url = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

    def get_fee_speech_text(
        self,
        service_name: str,
        official_fee: Optional[float],
        operator_charge: Optional[float],
        lang_code: str = 'hi'
    ) -> str:
        official_str = f"{official_fee:.2f}" if official_fee is not None else "राशि तय नहीं है"
        operator_str = f"{operator_charge:.2f}" if operator_charge is not None else "राशि तय नहीं है"
        total_str = f"{(official_fee + operator_charge):.2f}" if (official_fee is not None and operator_charge is not None) else "तय नहीं है"

        templates = {
            "hi": f"इस सेवा का नाम {service_name} है। सरकारी पोर्टल शुल्क: {official_str} रुपये। केंद्र सेवा शुल्क: {operator_str} रुपये। कुल देय राशि: {total_str} रुपये। कृपया भुगतान से पहले आधिकारिक पोर्टल पर शुल्क की पुष्टि करें। यह सरकारी रसीद नहीं है।",
            "mr": f"या सेवेचे नाव {service_name} आहे. सरकारी पोर्टल शुल्क: {official_str} रुपये. केंद्र सेवा शुल्क: {operator_str} रुपये. एकूण रक्कम: {total_str} रुपये. कृपया पैसे देण्यापूर्वी अधिकृत पोर्टलवर शुल्क तपासा. ही सरकारी पावती नाही.",
            "bn": f"এই পরিষেবার নাম {service_name}। সরকারি পোর্টাল ফি: {official_str} টাকা। কেন্দ্রের পরিষেবা চার্জ: {operator_str} টাকা। মোট প্রদেয়: {total_str} টাকা। অর্থ দেওয়ার আগে सरकारी পোর্টালে ফি যাচাই করুন। এটি সরকারি রসিদ নয়।",
            "gu": f"આ સેવાનું નામ {service_name} છે. સરકારી પોર્ટલ ફી: {official_str} રૂપિયા. કેન્દ્ર સેવા ચાર્જ: {operator_str} રૂપિયા. કુલ રકમ: {total_str} રૂપિયા. ચુકવણી પહેલાં અધિકૃત પોર્ટલ પર ફીની પુષ્ટિ કરો. આ સરકારી રસીદ નથી.",
            "ta": f"இந்த சேவையின் பெயர் {service_name}. அரசு இணையதளக் கட்டணம்: {official_str} ரூபாய். மைய சேவை கட்டணம்: {operator_str} ரூபாய். மொத்த தொகை: {total_str} ரூபாய். பணம் செலுத்துவதற்கு முன் இணையதளத்தில் உறுதிப்படுத்துங்கள். இது அரசு ரசீது அல்ல.",
            "te": f"ఈ సేవ పేరు {service_name}. ప్రభుత్వ పోర్టల్ రుసుము: {official_str} రూపాయలు. కేంద్ర సేవా ఛార్జీ: {operator_str} రూపాయలు. మొత్తం: {total_str} రూపాయలు. చెల్లించే ముందు పోర్టల్‌లో నిర్ధారించండి. ఇది ప్రభుత్వ రసీదు కాదు.",
            "en": f"The service is {service_name}. Official portal fee: {official_str} rupees. Centre service charge: {operator_str} rupees. Total payable: {total_str} rupees. Please confirm the official fee before payment. This is not a government receipt."
        }
        prefix = lang_code.split('-')[0].lower()
        return templates.get(prefix, templates["en"])

    def synthesize(self, text: str, lang_code: str = 'hi') -> bytes:
        cache_key = hashlib.sha256(f"{lang_code}:{text}".encode('utf-8')).hexdigest()
        cache_path = self.cache_dir / f"{cache_key}.wav"
        if cache_path.exists():
            return cache_path.read_bytes()

        # Tier 1: Attempt official BHASHINI / AI4Bharat ULCA API if credentials are provided
        if settings.BHASHINI_API_KEY:
            try:
                headers = {
                    "Authorization": settings.BHASHINI_API_KEY,
                    "ulcaApiKey": settings.BHASHINI_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {
                    "pipelineTasks": [
                        {
                            "taskType": "tts",
                            "config": {
                                "language": {"sourceLanguage": lang_code.split('-')[0]},
                                "gender": "female"
                            }
                        }
                    ],
                    "inputData": {"input": [{"source": text}]}
                }
                res = requests.post(self.api_url, json=payload, headers=headers, timeout=6)
                if res.status_code == 200:
                    import base64
                    data = res.json()
                    b64_audio = data["pipelineResponse"][0]["audio"][0]["audioContent"]
                    audio_bytes = base64.b64decode(b64_audio)
                    cache_path.write_bytes(audio_bytes)
                    return audio_bytes
            except Exception:
                pass

        # Tier 2: Real Local Voice Synthesis (Windows SAPI5 / pyttsx3)
        try:
            import pyttsx3
            engine = pyttsx3.init()
            voices = engine.getProperty('voices')
            target_voice = None
            if lang_code.startswith('hi'):
                target_voice = next((v for v in voices if 'hindi' in v.name.lower() or 'kalpana' in v.name.lower()), None)
            if not target_voice:
                target_voice = next((v for v in voices if 'india' in v.name.lower() or 'ravi' in v.name.lower() or 'heera' in v.name.lower()), None)
            if target_voice:
                engine.setProperty('voice', target_voice.id)
            engine.setProperty('rate', 155)

            temp_wav = self.cache_dir / f"tmp_{cache_key}.wav"
            engine.save_to_file(text, str(temp_wav))
            engine.runAndWait()
            if temp_wav.exists() and temp_wav.stat().st_size > 200:
                audio_bytes = temp_wav.read_bytes()
                cache_path.write_bytes(audio_bytes)
                temp_wav.unlink(missing_ok=True)
                return audio_bytes
        except Exception:
            pass

        # Tier 3: Offline chime WAV
        audio_bytes = generate_beep_wav(duration_s=0.8, freq=520.0)
        cache_path.write_bytes(audio_bytes)
        return audio_bytes

bhashini_service = BhashiniSpeechService()
