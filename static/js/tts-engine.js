/**
 * Conversational Text-to-Speech (TTS) Engine
 * Integrates Web Speech API with sentence-level visual highlighting,
 * conversational explainers, speed control, and passage narration.
 */

const TTSEngine = {
  synth: window.speechSynthesis || null,
  voices: [],
  selectedVoice: null,
  rate: 1.0,
  pitch: 1.0,
  isPlaying: false,
  isPaused: false,
  conversationalMode: true, // If true, speaks conversational summary first

  currentSection: null,
  currentPassage: null,
  paragraphs: [],
  currentParagraphIndex: -1,
  currentUtterance: null,

  // Callbacks for UI updates
  onStateChange: null,
  onParagraphChange: null,
  onError: null,

  init() {
    if (!this.synth) {
      console.warn('[TTS] Web Speech API not supported by this browser.');
      return false;
    }

    this.loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    // Load saved settings
    try {
      const savedRate = localStorage.getItem('zim_tts_rate');
      if (savedRate) this.rate = parseFloat(savedRate);
      const savedConv = localStorage.getItem('zim_tts_conversational');
      if (savedConv !== null) this.conversationalMode = savedConv === 'true';
    } catch (e) {}

    return true;
  },

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();

    // Prefer English voices with natural qualities
    const enVoices = this.voices.filter(v => v.lang.startsWith('en'));
    const preferred = enVoices.find(v => 
      v.name.includes('Natural') || 
      v.name.includes('Google') || 
      v.name.includes('Samantha') || 
      v.name.includes('Daniel') || 
      v.name.includes('Arthur') ||
      v.name.includes('Karen')
    );

    this.selectedVoice = preferred || enVoices[0] || this.voices[0] || null;
  },

  setVoice(voiceURI) {
    const v = this.voices.find(item => item.voiceURI === voiceURI);
    if (v) this.selectedVoice = v;
  },

  setRate(newRate) {
    this.rate = Math.max(0.5, Math.min(2.0, parseFloat(newRate)));
    try {
      localStorage.setItem('zim_tts_rate', this.rate.toString());
    } catch (e) {}

    // If currently speaking, restart current sentence at new rate
    if (this.isPlaying && !this.isPaused && this.currentParagraphIndex >= 0) {
      const remainingIndex = this.currentParagraphIndex;
      this.cancelSpeech();
      this.playFromIndex(remainingIndex);
    }
  },

  setConversationalMode(enabled) {
    this.conversationalMode = Boolean(enabled);
    try {
      localStorage.setItem('zim_tts_conversational', this.conversationalMode.toString());
    } catch (e) {}
  },

  /**
   * Speak a whole constitutional section with conversational intro
   */
  speakSection(section, startFromIndex = 0) {
    this.stop();
    this.currentSection = section;
    this.currentPassage = null;

    const speechQueue = [];

    // Conversational Briefing Intro
    if (this.conversationalMode && section.summary) {
      speechQueue.push({
        type: 'intro',
        text: `Here is a conversational overview of Section ${section.number}: ${section.title}. ${section.summary}`,
        displayIndex: -1
      });
    }

    // Title announcement
    speechQueue.push({
      type: 'title',
      text: `Section ${section.number}. ${section.title}.`,
      displayIndex: 0
    });

    // Parse section text into readable paragraphs
    const lines = section.content ? section.content.split('\n') : [];
    let currentBlock = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentBlock.length > 0) {
          speechQueue.push({
            type: 'body',
            text: currentBlock.join(' '),
            displayIndex: speechQueue.length
          });
          currentBlock = [];
        }
      } else {
        currentBlock.push(trimmed);
      }
    });

    if (currentBlock.length > 0) {
      speechQueue.push({
        type: 'body',
        text: currentBlock.join(' '),
        displayIndex: speechQueue.length
      });
    }

    this.paragraphs = speechQueue;
    this.isPlaying = true;
    this.isPaused = false;
    this.notifyStateChange();

    this.playFromIndex(startFromIndex);
  },

  /**
   * Speak a specific highlighted or selected custom passage
   */
  speakSelectedPassage(passageText, sectionContext) {
    this.stop();
    const cleanText = passageText.trim();
    if (!cleanText) return;

    this.currentSection = sectionContext || null;
    this.currentPassage = cleanText;

    const speechQueue = [];

    if (this.conversationalMode) {
      speechQueue.push({
        type: 'intro',
        text: `Selected passage reading${sectionContext ? ` from Section ${sectionContext.number}` : ''}.`,
        displayIndex: -1
      });
    }

    speechQueue.push({
      type: 'body',
      text: cleanText,
      displayIndex: 0
    });

    this.paragraphs = speechQueue;
    this.isPlaying = true;
    this.isPaused = false;
    this.notifyStateChange();

    this.playFromIndex(0);
  },

  playFromIndex(index) {
    if (!this.synth) return;
    if (index >= this.paragraphs.length) {
      this.finish();
      return;
    }

    this.currentParagraphIndex = index;
    const item = this.paragraphs[index];

    if (this.onParagraphChange) {
      this.onParagraphChange(item, index);
    }

    const utter = new SpeechSynthesisUtterance(item.text);
    this.currentUtterance = utter;

    if (this.selectedVoice) utter.voice = this.selectedVoice;
    utter.rate = this.rate;
    utter.pitch = this.pitch;

    utter.onend = () => {
      if (this.isPlaying && !this.isPaused) {
        this.playFromIndex(index + 1);
      }
    };

    utter.onerror = (e) => {
      // Ignore normal canceled events
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[TTS] Playback error:', e);
        if (this.onError) this.onError(e);
      }
    };

    this.synth.speak(utter);
  },

  pause() {
    if (!this.synth || !this.isPlaying || this.isPaused) return;
    this.synth.pause();
    this.isPaused = true;
    this.notifyStateChange();
  },

  resume() {
    if (!this.synth || !this.isPlaying || !this.isPaused) return;
    this.synth.resume();
    this.isPaused = false;
    this.notifyStateChange();
  },

  stop() {
    this.cancelSpeech();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentParagraphIndex = -1;
    this.notifyStateChange();
    if (this.onParagraphChange) {
      this.onParagraphChange(null, -1);
    }
  },

  cancelSpeech() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
  },

  finish() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentParagraphIndex = -1;
    this.notifyStateChange();
    if (this.onParagraphChange) {
      this.onParagraphChange(null, -1);
    }
  },

  next() {
    if (this.currentParagraphIndex < this.paragraphs.length - 1) {
      this.cancelSpeech();
      this.playFromIndex(this.currentParagraphIndex + 1);
    } else {
      this.stop();
    }
  },

  previous() {
    if (this.currentParagraphIndex > 0) {
      this.cancelSpeech();
      this.playFromIndex(this.currentParagraphIndex - 1);
    } else {
      this.playFromIndex(0);
    }
  },

  notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        currentSection: this.currentSection,
        currentPassage: this.currentPassage,
        rate: this.rate,
        conversationalMode: this.conversationalMode
      });
    }
  }
};

window.TTSEngine = TTSEngine;
