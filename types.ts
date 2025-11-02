
import { PrebuiltVoiceConfig } from '@google/genai';

export interface VoiceOption {
  label: string;
  value: PrebuiltVoiceConfig['voiceName'];
}

export interface AudioGenerationResult {
  audioUrl: string;
  mimeType: string;
}

export enum Speaker {
  SPEAKER_1 = 'SPEAKER_1',
  SPEAKER_2 = 'SPEAKER_2',
  // Extend as needed for more speakers, though Gemini TTS multi-speaker examples show 2.
}

export interface SpeechSettings {
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
}
