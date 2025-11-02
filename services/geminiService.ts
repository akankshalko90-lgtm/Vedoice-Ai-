
import { GoogleGenAI, Modality, SpeechConfig, MultiSpeakerVoiceConfig } from '@google/genai';
import { decode, decodeAudioData } from './audioUtils';
import { AudioGenerationResult, VoiceOption, SpeechSettings } from '../types';
import { MULTI_SPEAKER_VOICES, MULTI_SPEAKER_PATTERN } from '../constants';

const MODEL_NAME = 'gemini-2.5-flash-preview-tts';
const OUTPUT_SAMPLE_RATE = 24000;
const OUTPUT_CHANNELS = 1;

/**
 * Generates audio from text using the Gemini Text-to-Speech model.
 * Supports both single and multi-speaker synthesis.
 *
 * @param text The input text to convert to speech.
 * @param voiceName The name of the single voice to use (ignored if multi-speaker detected).
 * @param speechSettings The speech rate, pitch, and volume settings to apply.
 * @returns A promise resolving to an AudioGenerationResult containing the audio URL and MIME type.
 */
export const generateTTS = async (
  text: string,
  voiceName: VoiceOption['value'],
  speechSettings: SpeechSettings
): Promise<AudioGenerationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Reset regex for consistent behavior across calls
  MULTI_SPEAKER_PATTERN.lastIndex = 0;
  const speakerParts = parseMultiSpeakerText(text);
  const isMultiSpeaker = speakerParts.length > 0;

  let speechConfig: SpeechConfig = {};

  if (isMultiSpeaker) {
    const speakerVoiceConfigs: MultiSpeakerVoiceConfig['speakerVoiceConfigs'] = [];
    const uniqueSpeakers = new Set<string>();

    speakerParts.forEach(part => {
      const match = part.match(MULTI_SPEAKER_PATTERN);
      if (match && match[1]) {
        const speakerName = match[1].trim();
        if (!uniqueSpeakers.has(speakerName)) {
          const voice = MULTI_SPEAKER_VOICES[speakerName] || 'Zephyr'; // Default if not found
          speakerVoiceConfigs.push({
            speaker: speakerName,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
              speakingRate: speechSettings.speakingRate,
              pitch: speechSettings.pitch,
              volumeGainDb: speechSettings.volumeGainDb,
            },
          });
          uniqueSpeakers.add(speakerName);
        }
      }
    });

    if (speakerVoiceConfigs.length === 0) {
      // Fallback to single speaker if no valid speaker definitions found despite pattern match
      speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName },
          speakingRate: speechSettings.speakingRate,
          pitch: speechSettings.pitch,
          volumeGainDb: speechSettings.volumeGainDb,
        },
      };
    } else {
      speechConfig = {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakerVoiceConfigs,
        },
      };
    }

  } else {
    speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voiceName },
        speakingRate: speechSettings.speakingRate,
        pitch: speechSettings.pitch,
        volumeGainDb: speechSettings.volumeGainDb,
      },
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: speechConfig,
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('No audio data received from Gemini API.');
    }

    // Fix: Use window.AudioContext directly as webkitAudioContext is deprecated
    const audioCtx = new (window.AudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });

    // Decode the raw PCM audio data
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      audioCtx,
      OUTPUT_SAMPLE_RATE,
      OUTPUT_CHANNELS,
    );

    // Create a Blob from the AudioBuffer
    const audioData = convertAudioBufferToWavBlob(audioBuffer);
    const audioUrl = URL.createObjectURL(audioData);

    return { audioUrl, mimeType: 'audio/wav' };

  } catch (error) {
    console.error('Error generating TTS:', error);
    throw new Error(`Failed to generate audio: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Simple function to extract lines matching multi-speaker patterns.
 * @param text The input text.
 * @returns An array of strings, each representing a speaker's turn. Empty if no multi-speaker found.
 */
const parseMultiSpeakerText = (text: string): string[] => {
  const matches = [...text.matchAll(MULTI_SPEAKER_PATTERN)];
  return matches.map(match => match[0]); // Return the full matched lines
};

/**
 * Converts an AudioBuffer to a WAV Blob.
 * This is necessary because raw PCM cannot be directly played or downloaded easily by browsers.
 * @param audioBuffer The AudioBuffer to convert.
 * @returns A Blob containing the WAV audio data.
 */
function convertAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16; // 16-bit audio

  let len = audioBuffer.length * numOfChannels * 2; // 2 bytes per sample for 16-bit

  let buffer = new ArrayBuffer(44 + len);
  let view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 == PCM)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numOfChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numOfChannels * (bitDepth / 8), true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numOfChannels * (bitDepth / 8), true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, len, true);

  floatTo16BitPCM(view, 44, audioBuffer.getChannelData(0));

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}
