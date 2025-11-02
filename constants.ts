
import { VoiceOption, SpeechSettings } from './types';

export const VOICE_OPTIONS: VoiceOption[] = [
  { label: 'Zephyr (Default)', value: 'Zephyr' },
  { label: 'Kore', value: 'Kore' },
  { label: 'Puck', value: 'Puck' },
  { label: 'Charon', value: 'Charon' },
  { label: 'Fenrir', value: 'Fenrir' },
];

export const DEFAULT_VOICE = VOICE_OPTIONS[0].value;

export const MULTI_SPEAKER_VOICES: { [key: string]: VoiceOption['value'] } = {
  'Joe': 'Kore',
  'Jane': 'Puck',
  'Anna': 'Charon',
  'Max': 'Fenrir',
  'Sarah': 'Zephyr',
};

// Regex to detect a pattern like "SpeakerName: Text" at the beginning of a line.
// The 'g' flag is important for `matchAll` but will be reset for `test` usage.
export const MULTI_SPEAKER_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/gm;

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  speakingRate: 1.0,
  pitch: 0.0,
  volumeGainDb: 0.0,
};

export const SPEECH_RATE_OPTIONS = {
  min: 0.25,
  max: 4.0,
  step: 0.05,
};

export const PITCH_OPTIONS = {
  min: -20.0,
  max: 20.0,
  step: 0.5,
};

export const VOLUME_OPTIONS = {
  min: -6.0,
  max: 6.0,
  step: 0.5,
};
