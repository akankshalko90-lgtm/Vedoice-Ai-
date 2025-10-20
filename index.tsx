/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality, Type } from "@google/genai";
import lamejs from 'lamejs';
import React, { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { EditorView, keymap, placeholder, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

// --- Type Definitions ---
interface VoiceOption {
    value: string;
    text: string;
    country: string;
    lang: string;
    supported: boolean;
}

interface SpeakerConfig {
    id: number;
    name: string;
    voice: string;
}

type EditorId = 'tts' | 'story' | 'poetry';

interface CustomEmotionPreset {
    name: string;
    emotions: { emotion: string; intensity: number }[];
}

// --- Constants ---
const MAX_EMOTIONS = 3;
const MAX_SPEAKERS = 5; // Increased for AI Story mode
const MIN_SPEAKERS = 2;

const sampleTextMap: { [key: string]: string } = {
    en: 'Hello, this is a preview of my voice.',
    hi: 'नमस्ते, यह मेरी आवाज़ का पूर्वावलोकन है।',
    bn: 'নমস্কার, এটি আমার ভয়েসের একটি প্রিভিউ।',
    ta: 'வணக்கம், இது என் குரலின் முன்னோட்டம்.',
    es: 'Hola, esta es una vista previa de mi voz.',
    fr: 'Bonjour, ceci est un aperçu de ma voix.',
    de: 'Hallo, dies ist eine Vorschau meiner Stimme.',
    ja: 'こんにちは、これは私の声のプレビューです。',
    cmn: '你好，这是我声音的预览。',
};
const emotionAdverbMap: { [key: string]: string } = {
    joyful: 'joyfully', amused: 'amusedly', excited: 'excitedly', enthusiastic: 'enthusiastically', confident: 'confidently', hopeful: 'hopefully', calm: 'calmly', playful: 'playfully', proud: 'proudly',
    sad: 'sadly', angry: 'angrily', fearful: 'fearfully', concerned: 'in a concerned tone', disappointed: 'disappointedly', anxious: 'anxiously', annoyed: 'in an annoyed tone',
    sarcastic: 'sarcastically', surprised: 'in a surprised tone', suspenseful: 'suspensefully', skeptical: 'skeptically', thoughtful: 'thoughtfully',
    whisper: 'in a whispering tone', authoritative: 'authoritatively', cinematic: 'cinematically',
};
const emotionColorMap: { [key: string]: [number, number, number] } = {
    joyful: [255, 215, 0], amused: [255, 165, 0], excited: [255, 140, 0], enthusiastic: [255, 105, 180], confident: [30, 144, 255], hopeful: [144, 238, 144], calm: [173, 216, 230], playful: [255, 182, 193], proud: [218, 165, 32],
    sad: [70, 130, 180], angry: [220, 20, 60], fearful: [138, 43, 226], concerned: [100, 149, 237], disappointed: [128, 128, 128], anxious: [255, 69, 0], annoyed: [255, 99, 71],
    sarcastic: [128, 0, 128], surprised: [0, 255, 255], suspenseful: [47, 79, 79], skeptical: [106, 90, 205], thoughtful: [72, 61, 139],
    whisper: [211, 211, 211], authoritative: [0, 0, 139], cinematic: [25, 25, 112],
};
const emotionPresets: { [key: string]: { emotion: string, intensity: number }[] } = {
    'happy-excited': [{ emotion: 'joyful', intensity: 80 }, { emotion: 'excited', intensity: 60 }],
    'sad-concerned': [{ emotion: 'sad', intensity: 70 }, { emotion: 'concerned', intensity: 50 }],
    'sarcastic-annoyed': [{ emotion: 'sarcastic', intensity: 85 }, { emotion: 'annoyed', intensity: 40 }],
    'suspenseful-fearful': [{ emotion: 'suspenseful', intensity: 90 }, { emotion: 'fearful', intensity: 45 }],
};
const narrationStylePromptMap: { [key: string]: string } = {
    default: '',
    news: 'Recite in a clear, formal tone like a news anchor. ',
    documentary: 'Recite in a calm, informative tone like a documentary narrator. ',
    audiobook: 'Recite in an engaging, narrative tone like an audiobook narrator. ',
    trailer: 'Recite in a dramatic, epic tone like a movie trailer voiceover. ',
    asmr: 'Recite in a very soft, close-mic, whispering ASMR style. ',
    radio_dj: 'Recite in an upbeat, energetic tone like a morning show radio DJ. ',
    sports: 'Recite in a fast-paced, excited, and dynamic tone like a sports commentator. ',
    meditation: 'Recite in a slow, calming, and peaceful tone with pauses, like a meditation guide. ',
    elearning: 'Recite in a clear, friendly, and educational tone like an e-learning instructor. ',
};
const poetryAccentPromptMap: { [key: string]: string } = {
    // American
    'american-standard': 'in a standard American accent',
    'american-southern': 'in a gentle Southern American accent',
    'american-californian': 'in a relaxed, contemporary Californian accent',
    'american-new-york': 'in a distinct New York City accent',
    // British
    'british-rp': 'in a classic, clear Received Pronunciation British accent',
    'british-cockney': 'in a lively, informal Cockney accent from East London',
    'british-scottish': 'in a soft, melodic Scottish accent',
    'british-scouse': 'in a characteristic Scouse accent from Liverpool',
    'british-yorkshire': 'in a broad, friendly Yorkshire accent',
    // Irish
    'irish-dublin': 'in a friendly Dublin Irish accent',
    'irish-cork': 'in a lyrical Cork city Irish accent',
    // Indian
    'indian-generic': 'in a clear, metropolitan Indian English accent',
    'indian-hindi': 'in a Hindi-influenced Indian English accent',
    'indian-bengali': 'in a Bengali-influenced Indian English accent',
    'indian-tamil': 'in a Tamil-influenced Indian English accent',
    // Other World Accents
    'australian-general': 'in a general Australian accent',
    'canadian': 'in a standard Canadian accent',
    'south-african': 'in a general South African English accent',
    'nigerian': 'in a Nigerian English accent',
    'jamaican': 'in a Jamaican Patois-influenced English accent',
    'french': 'with a light, sophisticated French accent',
    'spanish': 'with a light, rhythmic Spanish accent',
};
const allVoices: VoiceOption[] = [
    { value: 'Zephyr', text: 'English (US) - Zephyr (Calm)', country: 'US', lang: 'en', supported: true }, { value: 'Puck', text: 'English (US) - Puck (Upbeat)', country: 'US', lang: 'en', supported: true }, { value: 'Kore', text: 'English (US) - Kore (Formal)', country: 'US', lang: 'en', supported: true }, { value: 'Charon', text: 'English (US) - Charon (Deep)', country: 'US', lang: 'en', supported: true }, { value: 'Fenrir', text: 'English (US) - Fenrir (Strong)', country: 'US', lang: 'en', supported: true },
    { value: 'Zephyr', text: 'Hindi - Zephyr (Calm)', country: 'IN', lang: 'hi', supported: true }, { value: 'Puck', text: 'Hindi - Puck (Upbeat)', country: 'IN', lang: 'hi', supported: true }, { value: 'Kore', text: 'Hindi - Kore (Formal)', country: 'IN', lang: 'hi', supported: true }, { value: 'Charon', text: 'Hindi - Charon (Deep)', country: 'IN', lang: 'hi', supported: true }, { value: 'Fenrir', text: 'Hindi - Fenrir (Strong)', country: 'IN', lang: 'hi', supported: true },
    { value: 'Zephyr', text: 'Bengali - Zephyr (Calm)', country: 'IN', lang: 'bn', supported: true }, { value: 'Puck', text: 'Bengali - Puck (Upbeat)', country: 'IN', lang: 'bn', supported: true }, { value: 'Kore', text: 'Bengali - Kore (Formal)', country: 'IN', lang: 'bn', supported: true }, { value: 'Charon', text: 'Bengali - Charon (Deep)', country: 'IN', lang: 'bn', supported: true }, { value: 'Fenrir', text: 'Bengali - Fenrir (Strong)', country: 'IN', lang: 'bn', supported: true },
    { value: 'Zephyr', text: 'Tamil - Zephyr (Calm)', country: 'IN', lang: 'ta', supported: true }, { value: 'Puck', text: 'Tamil - Puck (Upbeat)', country: 'IN', lang: 'ta', supported: true }, { value: 'Kore', text: 'Tamil - Kore (Formal)', country: 'IN', lang: 'ta', supported: true }, { value: 'Charon', text: 'Tamil - Charon (Deep)', country: 'IN', lang: 'ta', supported: true }, { value: 'Fenrir', text: 'Tamil - Fenrir (Strong)', country: 'IN', lang: 'ta', supported: true },
    { value: 'Zephyr', text: 'Spanish - Zephyr (Calm)', country: 'ES', lang: 'es', supported: true }, { value: 'Puck', text: 'Spanish - Puck (Upbeat)', country: 'ES', lang: 'es', supported: true }, { value: 'Kore', text: 'Spanish - Kore (Formal)', country: 'ES', lang: 'es', supported: true }, { value: 'Charon', text: 'Spanish - Charon (Deep)', country: 'ES', lang: 'es', supported: true }, { value: 'Fenrir', text: 'Spanish - Fenrir (Strong)', country: 'ES', lang: 'es', supported: true },
    { value: 'Zephyr', text: 'French - Zephyr (Calm)', country: 'FR', lang: 'fr', supported: true }, { value: 'Puck', text: 'French - Puck (Upbeat)', country: 'FR', lang: 'fr', supported: true }, { value: 'Kore', text: 'French - Kore (Formal)', country: 'FR', lang: 'fr', supported: true }, { value: 'Charon', text: 'French - Charon (Deep)', country: 'FR', lang: 'fr', supported: true }, { value: 'Fenrir', text: 'French - Fenrir (Strong)', country: 'FR', lang: 'fr', supported: true },
    { value: 'Zephyr', text: 'German - Zephyr (Calm)', country: 'DE', lang: 'de', supported: true }, { value: 'Puck', text: 'German - Puck (Upbeat)', country: 'DE', lang: 'de', supported: true }, { value: 'Kore', text: 'German - Kore (Formal)', country: 'DE', lang: 'de', supported: true }, { value: 'Charon', text: 'German - Charon (Deep)', country: 'DE', lang: 'de', supported: true }, { value: 'Fenrir', text: 'German - Fenrir (Strong)', country: 'DE', lang: 'de', supported: true },
    { value: 'Zephyr', text: 'Japanese - Zephyr (Calm)', country: 'JP', lang: 'ja', supported: true }, { value: 'Puck', text: 'Japanese - Puck (Upbeat)', country: 'JP', lang: 'ja', supported: true }, { value: 'Kore', text: 'Japanese - Kore (Formal)', country: 'JP', lang: 'ja', supported: true }, { value: 'Charon', text: 'Japanese - Charon (Deep)', country: 'JP', lang: 'ja', supported: true }, { value: 'Fenrir', text: 'Japanese - Fenrir (Strong)', country: 'JP', lang: 'ja', supported: true },
    { value: 'Zephyr', text: 'Mandarin - Zephyr (Calm)', country: 'CN', lang: 'cmn', supported: true }, { value: 'Puck', text: 'Mandarin - Puck (Upbeat)', country: 'CN', lang: 'cmn', supported: true }, { value: 'Kore', text: 'Mandarin - Kore (Formal)', country: 'CN', lang: 'cmn', supported: true }, { value: 'Charon', text: 'Mandarin - Charon (Deep)', country: 'CN', lang: 'cmn', supported: true }, { value: 'Fenrir', text: 'Mandarin - Fenrir (Strong)', country: 'CN', lang: 'cmn', supported: true },
];

const countryLanguageMap: { [key: string]: { code: string, name: string }[] } = {
    US: [{ code: 'en', name: 'English' }],
    IN: [{ code: 'hi', name: 'Hindi' }, { code: 'bn', name: 'Bengali' }, { code: 'ta', name: 'Tamil' }],
    ES: [{ code: 'es', name: 'Spanish' }],
    FR: [{ code: 'fr', name: 'French' }],
    DE: [{ code: 'de', name: 'German' }],
    JP: [{ code: 'ja', name: 'Japanese' }],
    CN: [{ code: 'cmn', name: 'Mandarin' }],
};

// --- Global State ---
let ai: GoogleGenAI;
const editors: { [key in EditorId]?: EditorView } = {};
let currentPreviewController: AbortController | null = null;
let activePreviewButton: HTMLButtonElement | null = null;
let currentGenerationController: AbortController | null = null;
let generationTimer: number | null = null;
let generationStartTime = 0;
let finalAudioBuffer: AudioBuffer | null = null;
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
let customEmotionPresets: CustomEmotionPreset[] = [];
// Bridge between React component and legacy generation function
let speakerConfigsForGeneration: Omit<SpeakerConfig, 'id'>[] = [];
// --- Performance Worker ---
let mp3Worker: Worker | null = null;
let isEncodingMp3 = false;


// --- DOM Elements ---
const getElem = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const appContainer = getElem('app-container');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const generateBtn = getElem<HTMLButtonElement>('generate-btn');
const cancelBtn = getElem<HTMLButtonElement>('cancel-btn');
const resetBtn = getElem<HTMLButtonElement>('reset-btn');
const playerContainer = getElem('player-container');
const audioPlayer = getElem<HTMLAudioElement>('audio-player');
const progressBarContainer = getElem('progress-bar-container');
const progressBar = getElem('progress-bar');
const progressText = getElem('progress-text');
const progressElapsed = getElem('progress-elapsed');
const exportOptions = getElem('export-options');
const downloadWavBtn = getElem<HTMLButtonElement>('download-wav-btn');
const downloadMp3Btn = getElem<HTMLButtonElement>('download-mp3-btn');
const mp3BitrateSelect = getElem<HTMLSelectElement>('mp3-bitrate-select');

// TTS Tab specific
const countrySelect = getElem<HTMLSelectElement>('country-select');
const languageSelect = getElem<HTMLSelectElement>('language-select');
const voiceSelect = getElem<HTMLSelectElement>('voice-select');
const voiceProfileSelect = getElem<HTMLSelectElement>('voice-profile-select');
const ttsVoiceControlsContainer = getElem('tts-voice-controls');
const narrationStyleSelect = getElem<HTMLSelectElement>('narration-style-select');
const hinglishToggle = getElem<HTMLInputElement>('tts-hinglish-toggle');

// Story Tab specific
const storyModeSelector = getElem('story-mode-selector');
const multiSpeakerSetup = getElem('multi-speaker-setup');
const singleSpeakerSetup = getElem('single-speaker-setup');
const aiDirectorOptions = getElem('ai-director-options');
const aiCreativeToggle = getElem<HTMLInputElement>('ai-creative-toggle');
const dialogueLanguageSettings = getElem('dialogue-language-settings');
const multiStoryCountrySelect = getElem<HTMLSelectElement>('multi-story-country-select');
const multiStoryLanguageSelect = getElem<HTMLSelectElement>('multi-story-language-select');
const analyzeScriptBtn = getElem<HTMLButtonElement>('analyze-script-btn');
const aiScriptwriterBtn = getElem<HTMLButtonElement>('ai-scriptwriter-btn');

// Story - single speaker
const storyVoiceProfileSelect = getElem<HTMLSelectElement>('story-voice-profile-select');
const storyCountrySelect = getElem<HTMLSelectElement>('story-country-select');
const storyLanguageSelect = getElem<HTMLSelectElement>('story-language-select');
const storyVoiceSelect = getElem<HTMLSelectElement>('story-voice-select');
const storySingleVoiceControls = getElem('story-single-voice-controls');
const storyAiToggle = getElem<HTMLInputElement>('story-ai-toggle');

// Poetry Tab specific
const poetryVoiceControlsContainer = getElem('poetry-voice-controls');
const genreSelect = getElem<HTMLSelectElement>('genre-select');
const regionSelect = getElem<HTMLSelectElement>('region-select');
const vowelPronunciationSlider = getElem<HTMLInputElement>('vowel-pronunciation-slider');
const vowelPronunciationValue = getElem('vowel-pronunciation-value');
const rhythmIntensitySlider = getElem<HTMLInputElement>('rhythm-intensity-slider');
const rhythmIntensityValue = getElem('rhythm-intensity-value');

// Emotion Lab
const emotionLab = getElem('emotion-lab');
const emotionLabMessage = getElem('emotion-lab-message');
const emotionPresetSelect = getElem<HTMLSelectElement>('emotion-preset-select');
const emotionVisualizer = getElem('emotion-visualizer');
const emotionControlsContainer = getElem('emotion-controls-container');
const addEmotionBtn = getElem<HTMLButtonElement>('add-emotion-btn');

// Audio Lab
const bgmSelect = getElem<HTMLSelectElement>('bgm-select');
const bgmVolumeSlider = getElem<HTMLInputElement>('bgm-volume-slider');
const bgmVolumeValue = getElem('bgm-volume-value');
// Effects
const reverbToggle = getElem<HTMLInputElement>('reverb-toggle');
const echoToggle = getElem<HTMLInputElement>('echo-toggle');
const bassBoostToggle = getElem<HTMLInputElement>('bass-boost-toggle');
const distortionToggle = getElem<HTMLInputElement>('distortion-toggle');
const telephoneToggle = getElem<HTMLInputElement>('telephone-toggle');
const radioStaticToggle = getElem<HTMLInputElement>('radio-static-toggle');

// Modals
const aiScriptwriterModal = getElem('ai-scriptwriter-modal');
const closeScriptwriterModalBtn = getElem<HTMLButtonElement>('close-scriptwriter-modal');
const plotOutlineInput = getElem<HTMLTextAreaElement>('plot-outline-input');
const generateScriptBtn = getElem<HTMLButtonElement>('generate-script-btn');
const myVoicesModal = getElem('my-voices-modal');
const closeVoicesModalBtn = getElem<HTMLButtonElement>('close-voices-modal');
const myVoicesBtn = getElem<HTMLButtonElement>('my-voices-btn');
const customEmotionsModal = getElem('custom-emotions-modal');
const closeEmotionsModalBtn = getElem<HTMLButtonElement>('close-emotions-modal');
const customEmotionsBtn = getElem<HTMLButtonElement>('custom-emotions-btn');
const newCustomEmotionNameInput = getElem<HTMLInputElement>('new-custom-emotion-name');
const saveCustomEmotionBtn = getElem<HTMLButtonElement>('save-custom-emotion-btn');
const customEmotionsListContainer = getElem('custom-emotions-list');
const noCustomEmotionsMessage = getElem('no-custom-emotions');


// Templates
const emotionControlTemplate = getElem<HTMLTemplateElement>('emotion-control-template');
const voiceControlTemplate = getElem<HTMLTemplateElement>('voice-control-template');
const editorToolbarTemplate = getElem<HTMLTemplateElement>('editor-toolbar-template');
const customEmotionItemTemplate = getElem<HTMLTemplateElement>('custom-emotion-item-template');


// Generation Log
const generationLogContainer = getElem('generation-log-container');
const generationLog = getElem('generation-log');


// --- Utility Functions ---

/**
 * Decodes a base64 string into a Uint8Array.
 * @param base64 The base64 encoded string.
 * @returns The decoded byte array.
 */
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer.
 * @param data The raw audio data.
 * @param ctx The AudioContext to use.
 * @param sampleRate The sample rate of the audio.
 * @param numChannels The number of channels.
 * @returns A promise that resolves to an AudioBuffer.
 */
async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

/**
 * Logs a message to the real-time generation log panel.
 * @param message The message to log.
 * @param isError Whether the message represents an error.
 */
function logProgress(message: string, isError = false) {
    if (generationLogContainer.classList.contains('hidden')) {
        generationLogContainer.classList.remove('hidden');
    }

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('p');
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    if (isError) {
        logEntry.style.color = 'var(--error-color)';
    }
    generationLog.appendChild(logEntry);
    generationLog.scrollTop = generationLog.scrollHeight;
}


// --- Voice Preview ---

/**
 * Toggles the loading state of a voice preview button.
 * @param button The button element.
 * @param isLoading True to show spinner, false to show play icon.
 */
function setPreviewButtonState(button: HTMLButtonElement, isLoading: boolean) {
    const playIcon = button.querySelector('.icon-play-preview');
    const spinner = button.querySelector('.spinner-small');
    button.disabled = isLoading;
    playIcon?.classList.toggle('hidden', isLoading);
    spinner?.classList.toggle('hidden', !isLoading);
}

/**
 * Generates and plays a short audio preview for a given voice.
 * @param voiceName The name of the voice to preview.
 * @param buttonEl The button element that triggered the preview.
 * @param langCode The BCP-47 language code for the sample text.
 */
async function previewVoice(voiceName: string, buttonEl: HTMLButtonElement, langCode: string) {
    if (!voiceName) return;

    // If another preview is active, stop it and reset its button
    if (currentPreviewController) {
        currentPreviewController.abort();
        if (activePreviewButton) {
            setPreviewButtonState(activePreviewButton, false);
        }
    }

    currentPreviewController = new AbortController();
    const { signal } = currentPreviewController;
    activePreviewButton = buttonEl;

    setPreviewButtonState(buttonEl, true);

    try {
        const sampleText = sampleTextMap[langCode] || sampleTextMap['en'];
        const emotionInstruction = getEmotionPromptString();
        const prompt = `${emotionInstruction}TTS the following text: ${sampleText}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
                },
            },
        });

        if (signal.aborted) return; // Aborted while fetching

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("API did not return audio for preview.");
        }

        const decodedBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);

        if (signal.aborted) return; // Aborted while decoding

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);

        const onEnded = () => {
            // Only reset if this is the currently active preview
            if (activePreviewButton === buttonEl) {
                setPreviewButtonState(buttonEl, false);
                currentPreviewController = null;
                activePreviewButton = null;
            }
        };

        source.onended = onEnded;

        signal.addEventListener('abort', () => {
            source.stop();
            // The onended event will fire, which will reset the state.
        });

    } catch (e: any) {
        if (e.name !== 'AbortError') {
            console.error("Voice preview failed:", e);
            alert(`Could not preview voice: ${e.message}`);
        }
        // If an error occurred, reset the button state
        if (activePreviewButton === buttonEl) {
            setPreviewButtonState(buttonEl, false);
            currentPreviewController = null;
            activePreviewButton = null;
        }
    }
}


// --- Custom Emotions Management ---

/**
 * Loads custom emotion presets from localStorage.
 */
function loadCustomEmotions() {
    const storedEmotions = localStorage.getItem('vedoice_custom_emotions');
    if (storedEmotions) {
        try {
            customEmotionPresets = JSON.parse(storedEmotions);
        } catch (e) {
            console.error("Failed to parse custom emotions from localStorage", e);
            customEmotionPresets = [];
        }
    }
}

/**
 * Saves the current custom emotion presets to localStorage.
 */
function saveCustomEmotions() {
    localStorage.setItem('vedoice_custom_emotions', JSON.stringify(customEmotionPresets));
}

/**
 * Applies a given emotion preset to the Emotion Lab UI.
 * @param emotions The array of emotions and intensities to apply.
 */
function applyEmotionPreset(emotions: { emotion: string; intensity: number }[]) {
    emotionControlsContainer.innerHTML = '';
    addEmotionBtn.disabled = false;
    if (emotions.length > 0) {
        emotions.forEach(p => {
            addEmotionControl(p.emotion, p.intensity);
        });
    } else {
        // If the preset is empty, add one neutral control
        addEmotionControl();
    }
}

/**
 * Updates the main Emotion Presets dropdown with custom blends.
 */
function updateEmotionPresetDropdown() {
    const existingOptgroup = emotionPresetSelect.querySelector('optgroup[label="My Blends"]');
    existingOptgroup?.remove();

    if (customEmotionPresets.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'My Blends';
        customEmotionPresets.forEach(preset => {
            const option = document.createElement('option');
            option.value = `custom_${preset.name}`;
            option.textContent = preset.name;
            optgroup.appendChild(option);
        });
        emotionPresetSelect.appendChild(optgroup);
    }
}

/**
 * Renders the list of saved custom emotions in the modal.
 */
function renderCustomEmotionsList() {
    customEmotionsListContainer.innerHTML = ''; // Clear previous items
    const hasEmotions = customEmotionPresets.length > 0;
    noCustomEmotionsMessage.classList.toggle('hidden', hasEmotions);
    if (!hasEmotions) return;


    customEmotionPresets.forEach(preset => {
        const template = customEmotionItemTemplate.content.cloneNode(true) as DocumentFragment;
        const item = template.querySelector('.custom-emotion-item') as HTMLElement;
        const nameEl = item.querySelector('.emotion-item-name') as HTMLSpanElement;
        const previewEl = item.querySelector('.emotion-item-preview') as HTMLDivElement;
        const applyBtn = item.querySelector('.apply-custom-emotion-btn') as HTMLButtonElement;
        const deleteBtn = item.querySelector('.delete-custom-emotion-btn') as HTMLButtonElement;

        nameEl.textContent = preset.name;
        previewEl.style.backgroundColor = calculateEmotionColor(preset.emotions);

        applyBtn.addEventListener('click', () => {
            applyEmotionPreset(preset.emotions);
            const matchingOption = emotionPresetSelect.querySelector(`option[value="custom_${preset.name}"]`);
            if (matchingOption) {
                (matchingOption as HTMLOptionElement).selected = true;
            }
            customEmotionsModal.classList.add('hidden');
        });

        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete the "${preset.name}" emotion blend?`)) {
                customEmotionPresets = customEmotionPresets.filter(p => p.name !== preset.name);
                saveCustomEmotions();
                renderCustomEmotionsList();
                updateEmotionPresetDropdown();
            }
        });

        customEmotionsListContainer.appendChild(item);
    });
}

/**
 * Saves the current Emotion Lab settings as a new custom preset.
 */
function saveCurrentEmotionBlend() {
    const name = newCustomEmotionNameInput.value.trim();
    if (!name) {
        alert('Please enter a name for your emotion blend.');
        return;
    }
    if (customEmotionPresets.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        alert('A blend with this name already exists. Please choose a different name.');
        return;
    }

    const controls = emotionControlsContainer.querySelectorAll('.emotion-control');
    const emotions: { emotion: string; intensity: number }[] = [];
    controls.forEach(control => {
        const select = control.querySelector('.emotion-select') as HTMLSelectElement;
        const slider = control.querySelector('.emotion-intensity') as HTMLInputElement;
        emotions.push({
            emotion: select.value,
            intensity: parseInt(slider.value)
        });
    });

    if (emotions.length === 0 || emotions.every(e => e.emotion === 'neutral')) {
        alert('Cannot save an empty or neutral blend. Please add and configure at least one emotion.');
        return;
    }

    customEmotionPresets.push({ name, emotions });
    saveCustomEmotions();
    renderCustomEmotionsList();
    updateEmotionPresetDropdown();
    newCustomEmotionNameInput.value = '';
    alert(`Blend "${name}" saved successfully!`);
}


// --- Editor Management ---
/**
 * Creates a CodeMirror editor instance.
 * @param parentId The ID of the parent element to attach the editor to.
 * @param editorId The unique ID for this editor instance.
 * @param placeholderText The placeholder text for the editor.
 * @returns The created EditorView instance.
 */
function createEditor(parentId: string, editorId: EditorId, placeholderText: string): EditorView {
    const parent = getElem(parentId);
    const charCountEl = document.querySelector(`.editor-char-count[data-editor-id="${editorId}"]`);

    const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged && charCountEl) {
            charCountEl.textContent = `Chars: ${update.state.doc.length}`;
        }
        updateUndoRedoState(editorId);
    });

    // --- New High-Performance Syntax Highlighter ---
    const speakerNameMark = Decoration.mark({ class: "cm-speakerName" });
    const vocalCueMark = Decoration.mark({ class: "cm-vocalCue" });
    const directorNoteMark = Decoration.mark({ class: "cm-directorNote" });

    const syntaxHighlighter = ViewPlugin.fromClass(class {
        decorations;

        constructor(view: EditorView) {
            this.decorations = this.highlight(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = this.highlight(update.view);
            }
        }

        highlight(view: EditorView) {
            const builder = new RangeSetBuilder<Decoration>();
            const speakerRegex = /^([A-Za-z0-9_]+):/;
            const cueRegex = /\(([^)]*)\)/g;
            const directorNoteRegex = /\[DIRECTOR'S NOTE:.*?\]/g;


            for (const { from, to } of view.visibleRanges) {
                for (let pos = from; pos <= to; ) {
                    const line = view.state.doc.lineAt(pos);

                    // Highlight Director's Notes, as they are distinct blocks
                    let noteMatch;
                    while ((noteMatch = directorNoteRegex.exec(line.text))) {
                         builder.add(line.from + noteMatch.index, line.from + noteMatch.index + noteMatch[0].length, directorNoteMark);
                    }

                    const speakerMatch = line.text.match(speakerRegex);
                    if (speakerMatch) {
                        builder.add(line.from, line.from + speakerMatch[0].length, speakerNameMark);
                    }
                    
                    let cueMatch;
                    while ((cueMatch = cueRegex.exec(line.text))) {
                        builder.add(line.from + cueMatch.index, line.from + cueMatch.index + cueMatch[0].length, vocalCueMark);
                    }
                    pos = line.to + 1;
                }
            }
            return builder.finish();
        }
    }, {
        decorations: v => v.decorations
    });
    
    // Theme to style the custom tokens
    const customTheme = EditorView.baseTheme({
        "&.cm-editor .cm-speakerName": { color: "#c678dd", fontWeight: "600" },
        "&.cm-editor .cm-vocalCue": { color: "#5c6370", fontStyle: "italic" },
        "&.cm-editor .cm-directorNote": { color: "#98c379", backgroundColor: "rgba(152, 195, 121, 0.1)", fontStyle: "italic", padding: "0.1em 0.2em", borderRadius: "3px" }
    });

    const state = EditorState.create({
        extensions: [
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            placeholder(placeholderText),
            oneDark,
            updateListener,
            EditorView.lineWrapping,
            syntaxHighlighter, // Use new efficient highlighter
            customTheme,
        ],
    });

    const view = new EditorView({
        state,
        parent,
    });
    
    view.dom.addEventListener('focus', () => parent.classList.add('focused'));
    view.dom.addEventListener('blur', () => parent.classList.remove('focused'));

    return view;
}

/**
 * Sets up the toolbar for a given editor.
 * @param editorId The ID of the editor.
 */
function setupEditorToolbar(editorId: EditorId) {
    const editor = editors[editorId];
    if (!editor) return;

    const toolbarContainer = document.querySelector(`.toolbar-container[data-editor-id="${editorId}"]`);
    if (!toolbarContainer) return;

    const template = editorToolbarTemplate.content.cloneNode(true) as DocumentFragment;
    toolbarContainer.appendChild(template);

    const toolbar = toolbarContainer.querySelector('.editor-toolbar');
    if (!toolbar) return;

    // Show/hide speaker/cue buttons based on editor
    const addSpeakerBtn = toolbar.querySelector('[data-action="add-speaker"]') as HTMLButtonElement;
    const addCueBtn = toolbar.querySelector('[data-action="add-cue"]') as HTMLButtonElement;
    const addDirectiveBtn = toolbar.querySelector('[data-action="add-directive"]') as HTMLButtonElement;
    if (editorId !== 'story') {
        addSpeakerBtn?.remove();
        addCueBtn?.remove();
        addDirectiveBtn?.remove();
        toolbar.querySelectorAll('.toolbar-divider')[1].remove();
    }

    toolbar.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest<HTMLButtonElement>('button[data-action]');
        if (!button) return;

        e.preventDefault();
        const action = button.dataset.action;

        switch (action) {
            case 'undo':
                undo(editor);
                break;
            case 'redo':
                redo(editor);
                break;
            case 'add-speaker':
                showSpeakerDropdown(button, editorId);
                break;
            case 'add-cue':
                insertText(editorId, '(angrily) ', 1, -2);
                break;
            case 'add-directive':
                const text = '\n[DIRECTOR\'S NOTE: ]\n';
                insertText(editorId, text, text.length - 3, -2);
                break;
            case 'clear':
                if (confirm('Are you sure you want to clear the editor content?')) {
                    editor.dispatch({
                        changes: { from: 0, to: editor.state.doc.length }
                    });
                }
                break;
        }
        editor.focus();
        updateUndoRedoState(editorId);
    });
}

/**
 * Shows a dropdown menu to insert a speaker tag.
 * @param button The button that triggered the dropdown.
 * @param editorId The editor to insert the tag into.
 */
function showSpeakerDropdown(button: HTMLButtonElement, editorId: EditorId) {
    // Remove any existing dropdown
    document.querySelector('.speaker-dropdown')?.remove();

    const speakerConfigs = getSpeakerConfigs();
    const dropdown = document.createElement('div');
    dropdown.className = 'speaker-dropdown';

    if (speakerConfigs.length > 0) {
        speakerConfigs.forEach(config => {
            const item = document.createElement('button');
            item.className = 'speaker-dropdown-item';
            item.textContent = config.name;
            item.onclick = () => {
                insertText(editorId, `${config.name}: `, 0, 0);
                dropdown.remove();
            };
            dropdown.appendChild(item);
        });
    } else {
        const item = document.createElement('div');
        item.className = 'speaker-dropdown-item no-speakers';
        item.textContent = 'No speakers defined';
        dropdown.appendChild(item);
    }
    
    document.body.appendChild(dropdown);
    const btnRect = button.getBoundingClientRect();
    dropdown.style.top = `${btnRect.bottom + 5}px`;
    dropdown.style.left = `${btnRect.left}px`;

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target as Node)) {
                dropdown.remove();
            }
        }, { once: true });
    }, 0);
}

/**
 * Inserts text into a CodeMirror editor and optionally selects a portion of it.
 * @param editorId The ID of the editor.
 * @param text The text to insert.
 * @param selectionStartOffset The starting offset for the selection relative to the inserted text.
 * @param selectionEndOffset The ending offset for the selection relative to the inserted text length.
 */
function insertText(editorId: EditorId, text: string, selectionStartOffset: number, selectionEndOffset: number) {
    const editor = editors[editorId];
    if (!editor) return;

    const { from, to } = editor.state.selection.main;
    const startPos = to;
    
    const transaction = editor.state.update({
        changes: { from: startPos, insert: text },
        selection: { 
            anchor: startPos + selectionStartOffset, 
            head: startPos + text.length + selectionEndOffset 
        },
        scrollIntoView: true,
        userEvent: 'input'
    });
    
    editor.dispatch(transaction);
    editor.focus();
}

/**
 * Updates the enabled/disabled state of the undo/redo buttons for an editor.
 * @param editorId The ID of the editor.
 */
function updateUndoRedoState(editorId: EditorId) {
    const editor = editors[editorId];
    if (!editor) return;

    const toolbarContainer = document.querySelector(`.toolbar-container[data-editor-id="${editorId}"]`);
    if (!toolbarContainer) return;

    const undoBtn = toolbarContainer.querySelector('[data-action="undo"]') as HTMLButtonElement | null;
    const redoBtn = toolbarContainer.querySelector('[data-action="redo"]') as HTMLButtonElement | null;

    if (undoBtn) {
        undoBtn.disabled = undoDepth(editor.state) === 0;
    }
    if (redoBtn) {
        redoBtn.disabled = redoDepth(editor.state) === 0;
    }
}


// --- UI Management ---

/**
 * Populates language options based on the selected country.
 * @param countrySelectEl The country select element.
 * @param languageSelectEl The language select element to populate.
 */
function populateLanguages(countrySelectEl: HTMLSelectElement, languageSelectEl: HTMLSelectElement) {
    const selectedCountry = countrySelectEl.value;
    const languages = countryLanguageMap[selectedCountry] || [];
    languageSelectEl.innerHTML = '';
    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        languageSelectEl.appendChild(option);
    });
    // Trigger change event to populate voices
    languageSelectEl.dispatchEvent(new Event('change'));
}

/**
 * Populates voice options based on selected country and language.
 * @param countrySelectEl The country select element.
 * @param languageSelectEl The language select element.
 * @param voiceSelectEl The voice select element to populate.
 */
function populateVoices(countrySelectEl: HTMLSelectElement, languageSelectEl: HTMLSelectElement, voiceSelectEl: HTMLSelectElement) {
    const selectedCountry = countrySelectEl.value;
    const selectedLang = languageSelectEl.value;
    voiceSelectEl.innerHTML = '';
    const filteredVoices = allVoices.filter(v => v.country === selectedCountry && v.lang === selectedLang && v.supported);

    filteredVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.text;
        voiceSelectEl.appendChild(option);
    });
}

/**
 * Creates and adds voice control sliders (rate, pitch, volume) to a container.
 * @param container The container element to append the controls to.
 * @param idPrefix A prefix for the element IDs to ensure uniqueness.
 */
function addVoiceControls(container: HTMLElement, idPrefix: string) {
    container.innerHTML = ''; // Clear existing controls
    const template = voiceControlTemplate.content.cloneNode(true) as DocumentFragment;
    
    // Update labels and inputs with the unique prefix
    (template.querySelector('.speech-rate-label') as HTMLLabelElement).htmlFor = `${idPrefix}-speech-rate-slider`;
    (template.querySelector('.speech-rate-value') as HTMLSpanElement).id = `${idPrefix}-speech-rate-value`;
    (template.querySelector('.speech-rate-slider') as HTMLInputElement).id = `${idPrefix}-speech-rate-slider`;
    (template.querySelector('.pitch-shift-label') as HTMLLabelElement).htmlFor = `${idPrefix}-pitch-shift-slider`;
    (template.querySelector('.pitch-shift-value') as HTMLSpanElement).id = `${idPrefix}-pitch-shift-value`;
    (template.querySelector('.pitch-shift-slider') as HTMLInputElement).id = `${idPrefix}-pitch-shift-slider`;
    (template.querySelector('.volume-label') as HTMLLabelElement).htmlFor = `${idPrefix}-volume-slider`;
    (template.querySelector('.volume-value') as HTMLSpanElement).id = `${idPrefix}-volume-value`;
    (template.querySelector('.volume-slider') as HTMLInputElement).id = `${idPrefix}-volume-slider`;

    container.appendChild(template);

    // Add event listeners for the new controls
    const rateSlider = getElem<HTMLInputElement>(`${idPrefix}-speech-rate-slider`);
    const rateValue = getElem(`${idPrefix}-speech-rate-value`);
    const pitchSlider = getElem<HTMLInputElement>(`${idPrefix}-pitch-shift-slider`);
    const pitchValue = getElem(`${idPrefix}-pitch-shift-value`);
    const volumeSlider = getElem<HTMLInputElement>(`${idPrefix}-volume-slider`);
    const volumeValue = getElem(`${idPrefix}-volume-value`);
    
    const ratePresets = container.querySelector('.rate-presets');

    rateSlider.addEventListener('input', () => {
        rateValue.textContent = `${parseFloat(rateSlider.value).toFixed(2)}x`;
        ratePresets?.querySelectorAll('.rate-btn').forEach(btn => btn.classList.remove('active'));
    });

    ratePresets?.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        if(target.classList.contains('rate-btn')) {
            const value = target.dataset.value;
            if(value) {
                rateSlider.value = value;
                rateSlider.dispatchEvent(new Event('input'));
                ratePresets.querySelectorAll('.rate-btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
            }
        }
    });

    pitchSlider.addEventListener('input', () => {
        const value = parseInt(pitchSlider.value);
        pitchValue.textContent = `${value > 0 ? '+' : ''}${value} cents`;
    });
    volumeSlider.addEventListener('input', () => {
        volumeValue.textContent = `${Math.round(parseFloat(volumeSlider.value) * 100)}%`;
    });
}

/**
 * Updates the UI visibility based on the currently active tab.
 */
function updateUIForTab() {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'tts';
    const settingsPanel = getElem('settings-panel');
    settingsPanel.querySelectorAll('[data-tabs]').forEach(el => {
        const htmlEl = el as HTMLElement;
        const visibleTabs = htmlEl.dataset.tabs?.split(',') || [];
        htmlEl.style.display = visibleTabs.includes(activeTab) ? '' : 'none';
    });
}

/**
 * Cancels the ongoing audio generation process.
 */
function cancelGeneration() {
    if (currentGenerationController) {
        currentGenerationController.abort();
        logProgress('Generation cancelled by user.');
    }
    if (generationTimer) {
        clearInterval(generationTimer);
        generationTimer = null;
    }
    
    // Immediately reset UI state
    document.querySelectorAll('.loading-overlay').forEach(o => o.classList.add('hidden'));
    generateBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    generateBtn.disabled = false;
    resetBtn.disabled = false;
    progressBarContainer.classList.add('hidden');
    playerContainer.classList.add('hidden');
}


// --- Emotion Lab ---
/**
 * Calculates the mixed color for an emotion blend.
 * @param emotions The array of emotions and intensities.
 * @returns An RGB color string.
 */
function calculateEmotionColor(emotions: { emotion: string; intensity: number }[]): string {
    let totalIntensity = 0;
    let r = 0, g = 0, b = 0;

    emotions.forEach(({ emotion, intensity }) => {
        if (emotion !== 'neutral' && intensity > 0) {
            const color = emotionColorMap[emotion];
            if (color) {
                r += color[0] * intensity;
                g += color[1] * intensity;
                b += color[2] * intensity;
                totalIntensity += intensity;
            }
        }
    });

    if (totalIntensity > 0) {
        const finalR = Math.round(r / totalIntensity);
        const finalG = Math.round(g / totalIntensity);
        const finalB = Math.round(b / totalIntensity);
        return `rgb(${finalR}, ${finalG}, ${finalB})`;
    }
    return 'var(--border-color)';
}


/**
 * Updates the emotion visualizer's color based on the current emotion mix.
 */
function updateEmotionVisualizer() {
    const controls = emotionControlsContainer.querySelectorAll('.emotion-control');
    const currentEmotions: { emotion: string; intensity: number }[] = [];
    controls.forEach(control => {
        const select = control.querySelector('.emotion-select') as HTMLSelectElement;
        const slider = control.querySelector('.emotion-intensity') as HTMLInputElement;
        currentEmotions.push({
            emotion: select.value,
            intensity: parseInt(slider.value)
        });
    });
    emotionVisualizer.style.backgroundColor = calculateEmotionColor(currentEmotions);
}

/**
 * Adds a new emotion control row to the Emotion Lab.
 * @param emotion The initial emotion to select.
 * @param intensity The initial intensity value (0-100).
 */
function addEmotionControl(emotion = 'neutral', intensity = 50) {
    const controlCount = emotionControlsContainer.children.length;
    if (controlCount >= MAX_EMOTIONS) {
        return;
    }

    const template = emotionControlTemplate.content.cloneNode(true) as DocumentFragment;
    const control = template.querySelector('.emotion-control') as HTMLElement;
    const select = control.querySelector('.emotion-select') as HTMLSelectElement;
    const slider = control.querySelector('.emotion-intensity') as HTMLInputElement;
    const valueSpan = control.querySelector('.slider-value') as HTMLSpanElement;
    const removeBtn = control.querySelector('.remove-emotion-btn') as HTMLButtonElement;

    select.value = emotion;
    slider.value = String(intensity);
    valueSpan.textContent = `${intensity}%`;

    slider.addEventListener('input', () => {
        valueSpan.textContent = `${slider.value}%`;
        updateEmotionVisualizer();
        emotionPresetSelect.value = 'custom'; // Any manual change sets preset to custom
    });

    select.addEventListener('change', () => {
        updateEmotionVisualizer();
        emotionPresetSelect.value = 'custom';
    });

    removeBtn.addEventListener('click', () => {
        control.remove();
        updateEmotionVisualizer();
        addEmotionBtn.disabled = false; // Re-enable add button
        emotionPresetSelect.value = 'custom';
    });
    
    emotionControlsContainer.appendChild(control);

    if (emotionControlsContainer.children.length >= MAX_EMOTIONS) {
        addEmotionBtn.disabled = true;
    }
    
    updateEmotionVisualizer();
}

/**
 * Constructs a prompt fragment based on the selected emotions to guide the AI.
 * @returns A string to be prepended to the main prompt.
 */
function getEmotionPromptString(): string {
    const controls = emotionControlsContainer.querySelectorAll('.emotion-control');
    const emotionStrings: string[] = [];

    controls.forEach(control => {
        const select = control.querySelector('.emotion-select') as HTMLSelectElement;
        const slider = control.querySelector('.emotion-intensity') as HTMLInputElement;
        const emotion = select.value;
        const intensity = parseInt(slider.value);

        if (emotion !== 'neutral' && intensity > 0) {
            const adverb = emotionAdverbMap[emotion] || `with ${emotion}`;
            // We don't include intensity in the prompt as the model interprets adverbs more naturally.
            // The intensity is for user feedback via the visualizer.
            emotionStrings.push(adverb);
        }
    });

    if (emotionStrings.length === 0) {
        return '';
    }
    
    // Creates a clear instruction for the model.
    return `Recite the following ${emotionStrings.join(' and ')}: `;
}


// --- Main Application Logic ---
/**
 * Retrieves speaker configurations from the React component's bridged state.
 * @returns An array of speaker configurations.
 */
function getSpeakerConfigs(): Omit<SpeakerConfig, 'id'>[] {
    return speakerConfigsForGeneration;
}

/**
 * Main function to generate audio based on current settings and script.
 */
async function generateAudio() {
    // --- 1. SETUP UI FOR GENERATION ---
    const editorLoadingOverlay = getElem('editor-panel').querySelector('.loading-overlay') as HTMLElement;
    const settingsLoadingOverlay = getElem('settings-panel').querySelector('.loading-overlay') as HTMLElement;
    editorLoadingOverlay.classList.remove('hidden');
    settingsLoadingOverlay.classList.remove('hidden');
    generateBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    resetBtn.disabled = true;
    
    playerContainer.classList.remove('hidden'); 
    audioPlayer.classList.add('hidden');
    exportOptions.classList.add('hidden');
    audioPlayer.src = '';
    finalAudioBuffer = null;

    generationLog.innerHTML = '';
    generationLogContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Initializing...';
    progressElapsed.textContent = 'Elapsed: 0s';
    progressBarContainer.classList.remove('hidden');
    generationStartTime = Date.now();
    generationTimer = window.setInterval(() => {
        const elapsed = Math.round((Date.now() - generationStartTime) / 1000);
        progressElapsed.textContent = `Elapsed: ${elapsed}s`;
    }, 1000);

    currentGenerationController = new AbortController();
    const { signal } = currentGenerationController;

    const updateProgress = (percentage: number, text: string) => {
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = text;
        logProgress(text);
    };

    try {
        // --- 2. GATHER SCRIPT AND SETTINGS ---
        updateProgress(5, 'Validating script...');
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') as EditorId || 'tts';
        const editor = editors[activeTab];
        const script = editor?.state.doc.toString() || '';

        if (!script.trim()) {
            throw new Error('Script is empty. Please enter some text to generate audio.');
        }

        let base64Audio: string | null = null;
        const emotionInstruction = getEmotionPromptString();
        
        // --- 3. EXECUTE TAB-SPECIFIC LOGIC ---
        if (activeTab === 'tts') {
            updateProgress(10, 'Gathering TTS settings...');
            const voice = voiceSelect.value;
            const narrationStyle = narrationStyleSelect.value;
            const useHinglish = hinglishToggle.checked;

            let promptBody = script;
            // Apply instructions in a logical order (Emotion -> Style -> Language specific)
            if (emotionInstruction) promptBody = `${emotionInstruction}${promptBody}`;
            const narrationInstruction = narrationStylePromptMap[narrationStyle];
            if (narrationInstruction) promptBody = `${narrationInstruction}${promptBody}`;
            if (useHinglish) promptBody = `The following is Hinglish text. Please pronounce all words appropriately. ${promptBody}`;
            
            const prompt = `TTS the following text: ${promptBody}`;

            updateProgress(20, 'Calling Gemini API for TTS...');
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                    },
                },
            });
            base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;

        } else if (activeTab === 'story') {
            const storyMode = (document.querySelector('input[name="story-mode"]:checked') as HTMLInputElement).value;
             if (storyMode === 'multi' || storyMode === 'ai') {
                updateProgress(10, 'Analyzing script for multi-speaker setup...');
                const speakers = getSpeakerConfigs();
                if (speakers.length < MIN_SPEAKERS) {
                    throw new Error(`Multi-speaker and AI Director modes require at least ${MIN_SPEAKERS} speakers to be configured.`);
                }
                const speakerVoiceConfigs = speakers.map(s => ({
                    speaker: s.name,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } }
                }));

                let prompt = '';
                if (storyMode === 'ai') {
                    updateProgress(15, 'Applying AI Director settings...');
                    const useCreativeFreedom = aiCreativeToggle.checked;
                    let processedScript;
                    if (useCreativeFreedom) {
                        // The previous complex prompt was causing a 500 error. 
                        // This simpler approach converts director's notes into standard parenthetical cues
                        // and provides a much more direct prompt to the TTS model.
                        processedScript = script.replace(/\[DIRECTOR'S NOTE: (.*?)\]/gs, '(NARRATION DIRECTION: $1)');
                        prompt = `TTS the following script, following all parenthetical directions for tone and pacing:\n\n${processedScript}`;
                    } else {
                        processedScript = script.replace(/\[DIRECTOR'S NOTE:.*?\]/gs, '').trim();
                        prompt = `TTS the following script, ignoring any parenthetical notes:\n\n${processedScript}`;
                    }
                } else { // 'multi' mode
                    prompt = `TTS the following conversation between ${speakers.map(s => s.name).join(' and ')}: ${script}`;
                }
                
                updateProgress(20, 'Calling Gemini API for multi-speaker synthesis...');
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            multiSpeakerVoiceConfig: { speakerVoiceConfigs }
                        }
                    }
                });
                base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;

             } else { // single speaker story
                updateProgress(10, 'Gathering single-speaker story settings...');
                const voice = storyVoiceSelect.value;
                const prompt = `TTS the following story: ${emotionInstruction}${script}`;
                
                updateProgress(20, 'Calling Gemini API for story narration...');
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                        },
                    },
                });
                base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
             }
        } else if (activeTab === 'poetry') {
            updateProgress(10, 'Constructing poetry recitation prompt...');
            const voice = voiceSelect.value;
            const genre = genreSelect.value;
            const accent = poetryAccentPromptMap[regionSelect.value];

            const prompt = `${emotionInstruction}Recite the following ${genre} ${accent}: ${script}`;
            
            updateProgress(20, 'Calling Gemini API for poetry recitation...');
             const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                    },
                },
            });
            base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
        }

        if (signal.aborted) return;
        
        // --- 4. DECODE AND PROCESS AUDIO ---
        updateProgress(60, 'Decoding generated audio data...');
        if (!base64Audio) {
            throw new Error('API did not return any audio data. Please check your script or settings.');
        }
        
        const decodedBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);
        if (signal.aborted) return;

        finalAudioBuffer = audioBuffer;
        
        // --- 6. FINALIZE AND DISPLAY ---
        updateProgress(95, 'Preparing audio for playback...');
        const wavBlob = bufferToWave(finalAudioBuffer, finalAudioBuffer.length);
        const blobUrl = URL.createObjectURL(wavBlob);
        audioPlayer.src = blobUrl;

        progressBarContainer.classList.add('hidden');
        audioPlayer.classList.remove('hidden');
        exportOptions.classList.remove('hidden');
        updateProgress(100, 'Generation Complete!');

    } catch (e: any) {
        if (e.name === 'AbortError') {
             console.log("Generation aborted.");
        } else {
            console.error("Generation failed:", e);
            logProgress(`Error: ${e.message}`, true);
            alert(`An error occurred during generation: ${e.message}`);
        }
        // If an error occurs, reset UI partially to allow retry
        progressBarContainer.classList.add('hidden');
        playerContainer.classList.add('hidden');

    } finally {
        // --- 7. CLEANUP ---
        if (generationTimer) clearInterval(generationTimer);
        generationTimer = null;
        editorLoadingOverlay.classList.add('hidden');
        settingsLoadingOverlay.classList.add('hidden');
        generateBtn.classList.remove('hidden');
        cancelBtn.classList.add('hidden');
        resetBtn.disabled = false;
        currentGenerationController = null;
    }
}

// --- Audio Export ---

/**
 * Converts an AudioBuffer to a WAV Blob.
 * @param abuffer The AudioBuffer to convert.
 * @param len The length of the buffer.
 * @returns A Blob in WAV format.
 */
function bufferToWave(abuffer: AudioBuffer, len: number): Blob {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [],
        i, sample,
        offset = 0,
        pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    // write interleaved data
    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++
    }

    return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Triggers a download for the generated audio in WAV format.
 */
function downloadWav() {
    if (!finalAudioBuffer) {
        alert('No audio generated to download.');
        return;
    }
    const blob = bufferToWave(finalAudioBuffer, finalAudioBuffer.length);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vedoice_output.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


/**
 * Triggers a download for the generated audio in MP3 format using a Web Worker.
 */
async function downloadMp3() {
    if (!finalAudioBuffer) {
        alert('No audio generated to download.');
        return;
    }
    if (isEncodingMp3) {
        alert('Already processing an MP3. Please wait.');
        return;
    }
    if (!mp3Worker) {
        alert('MP3 encoder is not initialized. Please refresh the page.');
        return;
    }

    isEncodingMp3 = true;
    const originalBtnContent = downloadMp3Btn.innerHTML;
    downloadMp3Btn.disabled = true;
    downloadMp3Btn.style.minWidth = `${downloadMp3Btn.offsetWidth}px`;
    downloadMp3Btn.innerHTML = `
        <div class="spinner-small" style="margin-right: 0.5rem;"></div>
        <span>Processing Audio...</span>
    `;

    try {
        const processedBuffer = await applyAudioLabEffects(finalAudioBuffer);

        const btnSpan = downloadMp3Btn.querySelector('span');
        if (btnSpan) btnSpan.textContent = 'Encoding...';

        const bitrate = parseInt(mp3BitrateSelect.value, 10);
        const pcmData = processedBuffer.getChannelData(0);
        // Create a copy of the PCM data to transfer. This prevents the original AudioBuffer
        // from being detached and allows for multiple exports.
        const pcmDataCopy = pcmData.slice(0);


        mp3Worker.onmessage = (e) => {
            const { blob } = e.data;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vedoice_output_${bitrate}kbps.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            isEncodingMp3 = false;
            downloadMp3Btn.disabled = false;
            downloadMp3Btn.innerHTML = originalBtnContent;
            downloadMp3Btn.style.minWidth = '';
            mp3Worker.onmessage = null;
        };

        mp3Worker.onerror = (e) => {
            console.error('Error from MP3 worker:', e);
            alert('An error occurred while encoding the MP3. Check the console for details.');
            isEncodingMp3 = false;
            downloadMp3Btn.disabled = false;
            downloadMp3Btn.innerHTML = originalBtnContent;
            downloadMp3Btn.style.minWidth = '';
            mp3Worker.onerror = null;
        };

        mp3Worker.postMessage({
            pcmData: pcmDataCopy.buffer,
            sampleRate: processedBuffer.sampleRate,
            bitrate: bitrate
        }, [pcmDataCopy.buffer]);

    } catch (e: any) {
        console.error("Failed to process audio for MP3 export:", e);
        alert(`An error occurred during audio processing: ${e.message}`);
        isEncodingMp3 = false;
        downloadMp3Btn.disabled = false;
        downloadMp3Btn.innerHTML = originalBtnContent;
        downloadMp3Btn.style.minWidth = '';
    }
}

// --- Audio Lab Post-Processing ---

/**
 * Creates a WaveShaper curve for the distortion effect.
 * @param amount The amount of distortion.
 * @returns A Float32Array representing the curve.
 */
function makeDistortionCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

/**
 * Programmatically creates an impulse response for the reverb effect.
 * @param context The AudioContext or OfflineAudioContext.
 * @param duration The duration of the impulse response in seconds.
 * @param decay The decay rate.
 * @returns An AudioBuffer containing the impulse response.
 */
function createReverbImpulseResponse(context: BaseAudioContext, duration = 2, decay = 2) {
    const sampleRate = context.sampleRate;
    const length = sampleRate * duration;
    const impulse = context.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = length - i;
        impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
        impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    }
    return impulse;
}

/**
 * The main post-processing function that applies all enabled effects from the Audio Lab.
 * @param inputBuffer The clean audio buffer to process.
 * @returns A promise that resolves with the processed AudioBuffer.
 */
async function applyAudioLabEffects(inputBuffer: AudioBuffer): Promise<AudioBuffer> {
    let currentBuffer = inputBuffer;

    // --- 1. Mix Background Music ---
    const bgmUrl = bgmSelect.value;
    if (bgmUrl !== 'none') {
        const bgmResponse = await fetch(bgmUrl);
        const bgmArrayBuffer = await bgmResponse.arrayBuffer();
        const bgmBuffer = await audioContext.decodeAudioData(bgmArrayBuffer);

        const duration = Math.max(currentBuffer.duration, bgmBuffer.duration);
        const mixContext = new OfflineAudioContext(1, Math.ceil(duration * currentBuffer.sampleRate), currentBuffer.sampleRate);

        const speechSource = mixContext.createBufferSource();
        speechSource.buffer = currentBuffer;
        const bgmSource = mixContext.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        const bgmGain = mixContext.createGain();
        bgmGain.gain.value = parseFloat(bgmVolumeSlider.value) / 100;

        speechSource.connect(mixContext.destination);
        bgmSource.connect(bgmGain).connect(mixContext.destination);
        speechSource.start(0);
        bgmSource.start(0);

        currentBuffer = await mixContext.startRendering();
    }

    // --- 2. Apply Effects Chain ---
    const hasEffects = bassBoostToggle.checked || distortionToggle.checked || telephoneToggle.checked || echoToggle.checked || reverbToggle.checked;

    if (hasEffects) {
        const effectContext = new OfflineAudioContext(1, currentBuffer.length, currentBuffer.sampleRate);
        const source = effectContext.createBufferSource();
        source.buffer = currentBuffer;
        let lastNode: AudioNode = source;

        // Apply effects in a logical order: EQ -> Distortion -> Time-based
        if (bassBoostToggle.checked) {
            const bassBoost = effectContext.createBiquadFilter();
            bassBoost.type = 'lowshelf';
            bassBoost.frequency.value = 300;
            bassBoost.gain.value = parseFloat(getElem<HTMLInputElement>('bass-boost-gain-slider').value);
            lastNode.connect(bassBoost);
            lastNode = bassBoost;
        }

        if (distortionToggle.checked) {
            const distortion = effectContext.createWaveShaper();
            distortion.curve = makeDistortionCurve(parseFloat(getElem<HTMLInputElement>('distortion-amount-slider').value));
            distortion.oversample = '4x';
            lastNode.connect(distortion);
            lastNode = distortion;
        }
        
        if (telephoneToggle.checked) {
            const telephoneEffect = effectContext.createBiquadFilter();
            telephoneEffect.type = 'bandpass';
            telephoneEffect.frequency.value = 2000;
            telephoneEffect.Q.value = 1;
            lastNode.connect(telephoneEffect);
            lastNode = telephoneEffect;
        }

        if (echoToggle.checked) {
            const delay = effectContext.createDelay(2.0);
            delay.delayTime.value = parseFloat(getElem<HTMLInputElement>('echo-delay-slider').value);
            const feedback = effectContext.createGain();
            feedback.gain.value = parseFloat(getElem<HTMLInputElement>('echo-feedback-slider').value);
            delay.connect(feedback).connect(delay);
            lastNode.connect(delay);
            lastNode = delay;
        }

        if (reverbToggle.checked) {
            const convolver = effectContext.createConvolver();
            convolver.buffer = createReverbImpulseResponse(effectContext, 2, 2);
            const wetGain = effectContext.createGain();
            wetGain.gain.value = parseFloat(getElem<HTMLInputElement>('reverb-mix-slider').value);
            const dryGain = effectContext.createGain();
            dryGain.gain.value = 1.0 - wetGain.gain.value;
            
            lastNode.connect(dryGain).connect(effectContext.destination);
            lastNode.connect(convolver).connect(wetGain).connect(effectContext.destination);
        } else {
            lastNode.connect(effectContext.destination);
        }

        source.start(0);
        currentBuffer = await effectContext.startRendering();
    }
    
    // --- 3. Mix Radio Static (applied last to be on top of everything) ---
    if(radioStaticToggle.checked) {
        const staticContext = new OfflineAudioContext(1, currentBuffer.length, currentBuffer.sampleRate);
        const speechSource = staticContext.createBufferSource();
        speechSource.buffer = currentBuffer;
        
        const noiseSource = staticContext.createBufferSource();
        const noiseBuffer = staticContext.createBuffer(1, currentBuffer.length, currentBuffer.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < currentBuffer.length; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        
        const noiseGain = staticContext.createGain();
        noiseGain.gain.value = parseFloat(getElem<HTMLInputElement>('radio-static-volume-slider').value) / 100;
        
        speechSource.connect(staticContext.destination);
        noiseSource.connect(noiseGain).connect(staticContext.destination);
        speechSource.start(0);
        noiseSource.start(0);

        currentBuffer = await staticContext.startRendering();
    }

    return currentBuffer;
}


// --- AI Helper Functions ---

/**
 * Uses Gemini to generate a script from a plot outline and places it in the Story editor.
 */
async function generateScriptFromOutline() {
    const outline = plotOutlineInput.value.trim();
    if (!outline) {
        alert('Please provide a plot outline.');
        return;
    }

    const spinner = generateScriptBtn.querySelector('.spinner-small') as HTMLElement;
    const modalLoadingOverlay = aiScriptwriterModal.querySelector('.loading-overlay') as HTMLElement;

    generateScriptBtn.disabled = true;
    spinner.classList.remove('hidden');
    modalLoadingOverlay.classList.remove('hidden');

    try {
        const prompt = `You are an expert scriptwriter. Based on the following plot outline, write a short, dialogue-heavy script. The script must be formatted strictly with each line as 'CHARACTER_NAME: Dialogue...'. Do not include scene descriptions or actions unless they are in parentheses within the dialogue. Ensure character names are single words (e.g., 'Character_A').

Outline: ${outline}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        const scriptText = response.text;

        const storyEditor = editors['story'];
        if (storyEditor) {
            storyEditor.dispatch({
                changes: { from: 0, to: storyEditor.state.doc.length, insert: scriptText }
            });
            aiScriptwriterModal.classList.add('hidden');
            // Switch to the story tab if not already active
            (document.querySelector('.tab-btn[data-tab="story"]') as HTMLButtonElement)?.click();
        } else {
            throw new Error("Story editor is not available.");
        }
    } catch (e: any) {
        console.error("Script generation failed:", e);
        alert(`Failed to generate script: ${e.message}`);
    } finally {
        generateScriptBtn.disabled = false;
        spinner.classList.add('hidden');
        modalLoadingOverlay.classList.add('hidden');
    }
}

/**
 * Analyzes the story script to identify speakers and updates the SpeakerManager.
 */
async function analyzeScriptForSpeakers() {
    const storyEditor = editors['story'];
    if (!storyEditor) return;

    const script = storyEditor.state.doc.toString();
    if (!script.trim()) {
        alert("The script is empty. Please write or generate a script first.");
        return;
    }

    const icon = analyzeScriptBtn.querySelector('.icon-analyze') as HTMLElement;
    const spinner = analyzeScriptBtn.querySelector('.spinner-small') as HTMLElement;

    analyzeScriptBtn.disabled = true;
    icon.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        const prompt = `Analyze the following script and return a JSON array of strings containing all unique character names. A character name is the word at the beginning of a line that is followed by a colon (e.g., 'CHARACTER_NAME:'). Do not include 'Narrator'.

Script:
${script}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING,
                        description: 'A unique character name found in the script.',
                    },
                },
            },
        });

        const characterNames = JSON.parse(response.text.trim()) as string[];

        if (!characterNames || characterNames.length === 0) {
            alert("No character names could be identified in the script.");
            return;
        }

        const defaultVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
        const newSpeakerConfigs = characterNames.slice(0, MAX_SPEAKERS).map((name, index) => ({
            id: Date.now() + index,
            name: name,
            voice: defaultVoices[index % defaultVoices.length],
        }));

        // Use a custom event to communicate with the React component
        document.dispatchEvent(new CustomEvent('setSpeakersFromScript', { detail: newSpeakerConfigs }));

    } catch (e: any) {
        console.error("Failed to analyze script:", e);
        alert(`Could not analyze script for speakers: ${e.message}`);
    } finally {
        analyzeScriptBtn.disabled = false;
        icon.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}


// --- React Components for Speaker Management ---
interface SpeakerControlProps {
    speaker: SpeakerConfig;
    availableVoices: VoiceOption[];
    onUpdate: (id: number, newName: string, newVoice: string) => void;
    onRemove: (id: number) => void;
    onPreview: (voice: string, event: MouseEvent<HTMLButtonElement>) => void;
}
const SpeakerControl: React.FC<SpeakerControlProps> = ({ speaker, availableVoices, onUpdate, onRemove, onPreview }) => {
    return (
        React.createElement('div', { className: 'speaker-config' },
            React.createElement('input', {
                type: 'text',
                className: 'speaker-name',
                placeholder: 'Speaker Name',
                value: speaker.name,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => onUpdate(speaker.id, e.target.value, speaker.voice),
                'aria-label': `Name for speaker ${speaker.id}`
            }),
            React.createElement('div', { className: 'select-wrapper' },
                React.createElement('select', {
                    className: 'speaker-voice',
                    value: speaker.voice,
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onUpdate(speaker.id, speaker.name, e.target.value),
                    'aria-label': `Voice for speaker ${speaker.id}`
                }, availableVoices.map(v => React.createElement('option', { key: v.value + v.text, value: v.value }, v.text))),
                React.createElement('button', {
                    className: 'icon-btn voice-preview-btn',
                    'aria-label': `Preview ${speaker.voice}`,
                    title: 'Preview Voice',
                    onClick: (e: MouseEvent<HTMLButtonElement>) => onPreview(speaker.voice, e)
                },
                    React.createElement('svg', { className: "icon-play-preview", xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" },
                        React.createElement('polygon', { points: "5 3 19 12 5 21 5 3" })
                    ),
                    React.createElement('div', { className: 'spinner-small hidden' })
                )
            ),
            React.createElement('button', {
                className: 'icon-btn remove-speaker-btn',
                title: 'Remove Speaker',
                onClick: () => onRemove(speaker.id)
            }, '\u00D7')
        )
    );
};

const SpeakerManager = () => {
    const [speakers, setSpeakers] = React.useState<SpeakerConfig[]>([
        { id: 1, name: 'Narrator', voice: 'Kore' },
        { id: 2, name: 'Character_A', voice: 'Zephyr' }
    ]);
    const [availableVoices, setAvailableVoices] = React.useState<VoiceOption[]>([]);
    const [selectedLang, setSelectedLang] = React.useState('en');
    const [selectedCountry, setSelectedCountry] = React.useState('US');

    // Listener for external updates from script analysis
    React.useEffect(() => {
        const handleSetSpeakers = (event: Event) => {
            const customEvent = event as CustomEvent<SpeakerConfig[]>;
            if (customEvent.detail && customEvent.detail.length > 0) {
                setSpeakers(customEvent.detail);
                 // Switch to multi-speaker mode if not already
                (getElem('mode-multi') as HTMLInputElement).checked = true;
                getElem('mode-multi').dispatchEvent(new Event('click', { bubbles: true }));
            }
        };

        document.addEventListener('setSpeakersFromScript', handleSetSpeakers);
        return () => {
            document.removeEventListener('setSpeakersFromScript', handleSetSpeakers);
        };
    }, []);

    React.useEffect(() => {
        const updateVoices = () => {
            const country = multiStoryCountrySelect.value;
            const lang = multiStoryLanguageSelect.value;
            setSelectedCountry(country);
            setSelectedLang(lang);
            const filtered = allVoices.filter(v => v.country === country && v.lang === lang && v.supported);
            setAvailableVoices(filtered);
        };

        multiStoryCountrySelect.addEventListener('change', () => populateLanguages(multiStoryCountrySelect, multiStoryLanguageSelect));
        multiStoryLanguageSelect.addEventListener('change', updateVoices);

        // Initial population
        populateLanguages(multiStoryCountrySelect, multiStoryLanguageSelect);
        updateVoices();

        return () => {
            multiStoryCountrySelect.removeEventListener('change', () => populateLanguages(multiStoryCountrySelect, multiStoryLanguageSelect));
            multiStoryLanguageSelect.removeEventListener('change', updateVoices);
        };
    }, []);

    React.useEffect(() => {
        speakerConfigsForGeneration = speakers.map(({ id, ...rest }) => rest);
    }, [speakers]);

    const addSpeaker = () => {
        if (speakers.length < MAX_SPEAKERS) {
            setSpeakers([
                ...speakers,
                { id: Date.now(), name: `Speaker_${speakers.length + 1}`, voice: availableVoices[0]?.value || 'Zephyr' }
            ]);
        }
    };

    const removeSpeaker = (id: number) => {
        if (speakers.length > MIN_SPEAKERS) {
            setSpeakers(speakers.filter(s => s.id !== id));
        } else {
            alert(`You need at least ${MIN_SPEAKERS} speakers.`);
        }
    };

    const updateSpeaker = (id: number, newName: string, newVoice: string) => {
        setSpeakers(speakers.map(s => s.id === id ? { ...s, name: newName, voice: newVoice } : s));
    };

    const handlePreview = (voiceName: string, event: MouseEvent<HTMLButtonElement>) => {
        const lang = multiStoryLanguageSelect.value;
        previewVoice(voiceName, event.currentTarget, lang);
    };

    return (
        React.createElement('div', null,
            React.createElement('div', { id: 'multi-speaker-header' },
                React.createElement('label', null, 'Speakers'),
                React.createElement('div', { className: 'add-speaker-controls' },
                    React.createElement('span', null, `(${speakers.length}/${MAX_SPEAKERS})`),
                    React.createElement('button', {
                        className: 'icon-btn',
                        onClick: addSpeaker,
                        disabled: speakers.length >= MAX_SPEAKERS,
                        title: 'Add Speaker'
                    },
                     React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round"},
                        React.createElement('line', {x1: "12", y1: "5", x2: "12", y2: "19"}),
                        React.createElement('line', {x1: "5", y1: "12", x2: "19", y2: "12"})
                     )
                    )
                )
            ),
            React.createElement('div', { id: 'speaker-controls-container' },
                speakers.map(speaker => React.createElement(SpeakerControl, {
                    key: speaker.id,
                    speaker,
                    availableVoices,
                    onUpdate: updateSpeaker,
                    onRemove: removeSpeaker,
                    onPreview: handlePreview
                }))
            )
        )
    );
};


// --- Initialization ---

/**
 * Sets up the Web Worker for MP3 encoding.
 */
function setupMp3Worker() {
    const workerCode = `
        importScripts('https://unpkg.com/lamejs@1.2.1/lame.min.js');

        self.onmessage = (e) => {
            const { pcmData, sampleRate, bitrate } = e.data;
            const pcmFloat32 = new Float32Array(pcmData);
            
            const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
            
            // Float32Array to Int16Array conversion
            const samples = new Int16Array(pcmFloat32.length);
            for (let i = 0; i < pcmFloat32.length; i++) {
                const s = Math.max(-1, Math.min(1, pcmFloat32[i]));
                samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            const mp3Data = [];
            const sampleBlockSize = 1152;
            for (let i = 0; i < samples.length; i += sampleBlockSize) {
                const sampleChunk = samples.subarray(i, i + sampleBlockSize);
                const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }
            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }

            const blob = new Blob(mp3Data, { type: 'audio/mpeg' });
            self.postMessage({ blob });
        };
    `;
    try {
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        mp3Worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
        console.error("Failed to initialize MP3 worker:", e);
        alert("Could not initialize the MP3 encoder. Audio export may not work.");
    }
}

function init() {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    setupMp3Worker();

    // Create editors
    editors['tts'] = createEditor('script-input-container', 'tts', 'Enter your text-to-speech script here...');
    editors['story'] = createEditor('story-script-input-container', 'story', 'Enter your multi-character dialogue or story here...');
    editors['poetry'] = createEditor('poetry-input-container', 'poetry', 'Enter the poem you wish to have recited...');

    // Setup toolbars
    setupEditorToolbar('tts');
    setupEditorToolbar('story');
    setupEditorToolbar('poetry');

    // Populate dropdowns
    populateLanguages(countrySelect, languageSelect);
    populateVoices(countrySelect, languageSelect, voiceSelect);
    populateLanguages(storyCountrySelect, storyLanguageSelect);
    populateVoices(storyCountrySelect, storyLanguageSelect, storyVoiceSelect);
    
    // Add voice controls
    addVoiceControls(ttsVoiceControlsContainer, 'tts');
    addVoiceControls(poetryVoiceControlsContainer, 'poetry');
    addVoiceControls(storySingleVoiceControls, 'story-single');

    // Setup initial emotion lab state
    addEmotionControl();
    
    // Custom emotions
    loadCustomEmotions();
    renderCustomEmotionsList();
    updateEmotionPresetDropdown();
    
    // Render React components
    const speakerManagerRoot = createRoot(getElem('speaker-manager-root'));
    speakerManagerRoot.render(React.createElement(SpeakerManager));


    // --- EVENT LISTENERS ---
    
    // Tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            getElem(`${tab}-content`).classList.add('active');
            updateUIForTab();
        });
    });
    
    // Main Actions
    generateBtn.addEventListener('click', generateAudio);
    cancelBtn.addEventListener('click', cancelGeneration);
    resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings and scripts?')) {
            window.location.reload();
        }
    });
    
    // Export
    downloadWavBtn.addEventListener('click', downloadWav);
    downloadMp3Btn.addEventListener('click', downloadMp3);
    
    // TTS & Poetry Voice Selection
    countrySelect.addEventListener('change', () => populateLanguages(countrySelect, languageSelect));
    languageSelect.addEventListener('change', () => populateVoices(countrySelect, languageSelect, voiceSelect));

    // Story Voice Selection
    storyCountrySelect.addEventListener('change', () => populateLanguages(storyCountrySelect, storyLanguageSelect));
    storyLanguageSelect.addEventListener('change', () => populateVoices(storyCountrySelect, storyLanguageSelect, storyVoiceSelect));
    
    // Voice Previews (for non-React buttons)
    const ttsPreviewBtn = voiceSelect.parentElement?.querySelector('.voice-preview-btn') as HTMLButtonElement;
    if (ttsPreviewBtn) {
        ttsPreviewBtn.addEventListener('click', () => {
            previewVoice(voiceSelect.value, ttsPreviewBtn, languageSelect.value);
        });
    }
    const storyPreviewBtn = storyVoiceSelect.parentElement?.querySelector('.voice-preview-btn') as HTMLButtonElement;
    if (storyPreviewBtn) {
        storyPreviewBtn.addEventListener('click', () => {
            previewVoice(storyVoiceSelect.value, storyPreviewBtn, storyLanguageSelect.value);
        });
    }

    // Story Mode
    storyModeSelector.addEventListener('click', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.name === 'story-mode') {
            const mode = target.value;
            multiSpeakerSetup.classList.toggle('hidden', mode !== 'multi' && mode !== 'ai');
            singleSpeakerSetup.classList.toggle('hidden', mode !== 'single');
            aiDirectorOptions.classList.toggle('hidden', mode !== 'ai');
            dialogueLanguageSettings.classList.toggle('hidden', mode === 'single');
        }
    });

    // Story AI Tools
    analyzeScriptBtn.addEventListener('click', analyzeScriptForSpeakers);

    // Poetry Sliders
    vowelPronunciationSlider.addEventListener('input', () => {
        const value = parseInt(vowelPronunciationSlider.value);
        let text = 'Moderate';
        if (value < 25) text = 'Clipped'; else if (value > 75) text = 'Elongated';
        vowelPronunciationValue.textContent = text;
    });
    rhythmIntensitySlider.addEventListener('input', () => {
        const value = parseInt(rhythmIntensitySlider.value);
        let text = 'Natural';
        if (value < 25) text = 'Subtle'; else if (value > 75) text = 'Emphatic';
        rhythmIntensityValue.textContent = text;
    });
    
    // Emotion Lab
    addEmotionBtn.addEventListener('click', () => addEmotionControl());
    emotionPresetSelect.addEventListener('change', () => {
        const value = emotionPresetSelect.value;
        if (value in emotionPresets) {
            applyEmotionPreset(emotionPresets[value]);
        } else if (value.startsWith('custom_')) {
            const name = value.replace('custom_', '');
            const preset = customEmotionPresets.find(p => p.name === name);
            if (preset) {
                applyEmotionPreset(preset.emotions);
            }
        }
    });
    
    // Audio Lab Controls
    document.querySelectorAll<HTMLInputElement>('#audio-effects-lab input[type="checkbox"]').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const paramsId = toggle.dataset.controls;
            if (paramsId) {
                const paramsContainer = getElem(paramsId);
                paramsContainer.classList.toggle('hidden', !toggle.checked);
            }
        });
    });
    
    bgmVolumeSlider.addEventListener('input', () => bgmVolumeValue.textContent = `${bgmVolumeSlider.value}%`);
    getElem<HTMLInputElement>('reverb-mix-slider').addEventListener('input', (e) => getElem('reverb-mix-value').textContent = `${Math.round((e.target as HTMLInputElement).valueAsNumber * 100)}%`);
    getElem<HTMLInputElement>('echo-delay-slider').addEventListener('input', (e) => getElem('echo-delay-value').textContent = `${(e.target as HTMLInputElement).valueAsNumber.toFixed(2)}s`);
    getElem<HTMLInputElement>('echo-feedback-slider').addEventListener('input', (e) => getElem('echo-feedback-value').textContent = `${Math.round((e.target as HTMLInputElement).valueAsNumber * 100)}%`);
    getElem<HTMLInputElement>('bass-boost-gain-slider').addEventListener('input', (e) => getElem('bass-boost-gain-value').textContent = `${(e.target as HTMLInputElement).valueAsNumber} dB`);
    getElem<HTMLInputElement>('distortion-amount-slider').addEventListener('input', (e) => getElem('distortion-amount-value').textContent = `${(e.target as HTMLInputElement).valueAsNumber}`);
    getElem<HTMLInputElement>('radio-static-volume-slider').addEventListener('input', (e) => getElem('radio-static-volume-value').textContent = `${(e.target as HTMLInputElement).valueAsNumber}%`);


    // Modals
    aiScriptwriterBtn.addEventListener('click', () => aiScriptwriterModal.classList.remove('hidden'));
    closeScriptwriterModalBtn.addEventListener('click', () => aiScriptwriterModal.classList.add('hidden'));
    generateScriptBtn.addEventListener('click', generateScriptFromOutline);
    myVoicesBtn.addEventListener('click', () => myVoicesModal.classList.remove('hidden'));
    closeVoicesModalBtn.addEventListener('click', () => myVoicesModal.classList.add('hidden'));
    customEmotionsBtn.addEventListener('click', () => {
        renderCustomEmotionsList();
        customEmotionsModal.classList.remove('hidden');
    });
    closeEmotionsModalBtn.addEventListener('click', () => customEmotionsModal.classList.add('hidden'));
    saveCustomEmotionBtn.addEventListener('click', saveCurrentEmotionBlend);


    updateUIForTab(); // Set initial visibility
}

document.addEventListener('DOMContentLoaded', init);