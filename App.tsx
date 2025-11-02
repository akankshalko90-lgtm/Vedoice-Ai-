
import React, { useState, useCallback, useRef } from 'react';
import { generateTTS } from './services/geminiService';
import Button from './components/Button';
import Select from './components/Select';
import TextArea from './components/TextArea';
import Slider from './components/Slider'; // Import new Slider component
import {
  VOICE_OPTIONS,
  DEFAULT_VOICE,
  MULTI_SPEAKER_PATTERN,
  MULTI_SPEAKER_VOICES,
  DEFAULT_SPEECH_SETTINGS,
  SPEECH_RATE_OPTIONS,
  PITCH_OPTIONS,
  VOLUME_OPTIONS,
} from './constants';
import { VoiceOption, SpeechSettings } from './types';

function App() {
  const [inputText, setInputText] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption['value']>(DEFAULT_VOICE);
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(DEFAULT_SPEECH_SETTINGS);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleSettingsChange = useCallback((setting: keyof SpeechSettings, value: number) => {
    setSpeechSettings(prev => ({ ...prev, [setting]: value }));
  }, []);

  const handleGenerateAudio = useCallback(async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to generate audio.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAudioUrl(null); // Clear previous audio

    try {
      const result = await generateTTS(inputText, selectedVoice, speechSettings);
      setAudioUrl(result.audioUrl);
      // Automatically play the audio once it's loaded
      if (audioRef.current) {
        audioRef.current.load(); // Reload audio source
        audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      }
    } catch (err) {
      console.error("Failed to generate audio:", err);
      setError(`Failed to generate audio: ${err instanceof Error ? err.message : 'An unknown error occurred.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, selectedVoice, speechSettings]); // Dependencies for useCallback

  const handleClear = useCallback(() => {
    setInputText('');
    setSelectedVoice(DEFAULT_VOICE);
    setSpeechSettings(DEFAULT_SPEECH_SETTINGS); // Reset speech settings
    setAudioUrl(null);
    setError(null);
    setIsLoading(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = ''; // Clear source to prevent browser issues
    }
  }, []);

  const hasMultiSpeakerPattern = (text: string): boolean => {
    // Ensure regex lastIndex is reset before test for accurate results
    MULTI_SPEAKER_PATTERN.lastIndex = 0;
    return MULTI_SPEAKER_PATTERN.test(text);
  };

  const showMultiSpeakerWarning = hasMultiSpeakerPattern(inputText);

  const getRecognizedSpeakers = (text: string): string[] => {
    MULTI_SPEAKER_PATTERN.lastIndex = 0; // Reset for `matchAll`
    const matches = [...text.matchAll(MULTI_SPEAKER_PATTERN)];
    const speakers = new Set<string>();
    matches.forEach(match => {
      if (match[1]) {
        speakers.add(match[1]);
      }
    });
    return Array.from(speakers);
  };

  const recognizedSpeakers = getRecognizedSpeakers(inputText);
  const unknownSpeakers = recognizedSpeakers.filter(speaker => !MULTI_SPEAKER_VOICES[speaker]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <header className="w-full max-w-4xl text-center py-6 mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">Vedoice AI</h1>
        <p className="mt-3 text-lg sm:text-xl text-gray-300">
          Unleash your voice with limitless AI-powered audio generation.
        </p>
      </header>

      <main className="w-full max-w-4xl bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl flex flex-col space-y-6">
        <TextArea
          id="inputText"
          label="Text to Speech"
          placeholder="Enter text here. For multi-speaker audio, use format like 'Joe: Hello. Jane: Hi there!'"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={10}
          className="resize-y min-h-[150px]"
          disabled={isLoading}
        />

        {showMultiSpeakerWarning && (
          <div className="bg-blue-800 border-l-4 border-blue-500 text-blue-100 p-4 rounded-md" role="alert">
            <p className="font-bold">Multi-Speaker Mode Activated!</p>
            <p className="text-sm">The system detected speaker tags and will attempt to generate multi-speaker audio.</p>
            {recognizedSpeakers.length > 0 && (
              <p className="text-xs mt-1">Recognized speakers: {recognizedSpeakers.join(', ')}.</p>
            )}
            {unknownSpeakers.length > 0 && (
              <p className="text-xs mt-1 text-yellow-300">
                Warning: No predefined voice for speakers: {unknownSpeakers.join(', ')}. They will use a default voice.
                Configure voices in `constants.ts` (MULTI_SPEAKER_VOICES).
              </p>
            )}
          </div>
        )}

        {/* New Speech Settings Section */}
        <div className="bg-gray-700 p-5 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold text-white mb-3">Speech Settings</h2>
          <Slider
            id="speakingRate"
            label="Speech Rate"
            min={SPEECH_RATE_OPTIONS.min}
            max={SPEECH_RATE_OPTIONS.max}
            step={SPEECH_RATE_OPTIONS.step}
            value={speechSettings.speakingRate}
            onChange={(e) => handleSettingsChange('speakingRate', parseFloat(e.target.value))}
            unit="x"
            disabled={isLoading}
          />
          <Slider
            id="pitch"
            label="Pitch"
            min={PITCH_OPTIONS.min}
            max={PITCH_OPTIONS.max}
            step={PITCH_OPTIONS.step}
            value={speechSettings.pitch}
            onChange={(e) => handleSettingsChange('pitch', parseFloat(e.target.value))}
            unit=" semitones"
            disabled={isLoading}
          />
          <Slider
            id="volumeGainDb"
            label="Volume Gain"
            min={VOLUME_OPTIONS.min}
            max={VOLUME_OPTIONS.max}
            step={VOLUME_OPTIONS.step}
            value={speechSettings.volumeGainDb}
            onChange={(e) => handleSettingsChange('volumeGainDb', parseFloat(e.target.value))}
            unit=" dB"
            disabled={isLoading}
          />
        </div>

        <Select
          id="voiceSelect"
          label="Select Voice"
          options={VOICE_OPTIONS}
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value as VoiceOption['value'])}
          disabled={isLoading || showMultiSpeakerWarning}
        />

        {showMultiSpeakerWarning && (
            <p className="text-sm text-gray-400 -mt-4">
              Voice selection is overridden when multi-speaker patterns are detected.
            </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 sticky bottom-0 bg-gray-800 pt-4 pb-2 -mx-6 sm:-mx-8 px-6 sm:px-8 z-10 border-t border-gray-700">
          <Button
            onClick={handleGenerateAudio}
            loading={isLoading}
            disabled={!inputText.trim()}
            className="flex-grow"
          >
            Generate Audio
          </Button>
          <Button
            onClick={handleClear}
            variant="secondary"
            disabled={isLoading}
            className="flex-grow sm:flex-grow-0"
          >
            Clear
          </Button>
        </div>

        {error && (
          <div className="bg-red-900 border-l-4 border-red-500 text-red-100 p-4 rounded-md" role="alert">
            <p className="font-bold">Error!</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {audioUrl && (
          <div className="mt-6 p-4 bg-gray-700 rounded-lg flex flex-col items-center space-y-4">
            <h2 className="text-xl font-semibold text-white">Generated Audio</h2>
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              className="w-full max-w-lg mt-2"
              preload="auto"
            >
              Your browser does not support the audio element.
            </audio>
            <a
              href={audioUrl}
              download="vedoice_ai_audio.wav"
              className="text-white bg-blue-600 hover:bg-blue-700 font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out"
            >
              Download Audio
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
