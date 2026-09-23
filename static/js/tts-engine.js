/**
 * Conversational Text-to-Speech (TTS) Engine
 * Integrates Web Speech API (Free & Offline) and ElevenLabs API (Premium HD AI Voice)
 * with sentence-level visual highlighting, conversational explainers, and speed controls.
 */

const TTSEngine = {
  synth: window.speechSynthesis || null,
  voices: [],
  selectedVoice: null,
  isElevenLabs: false,
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
  currentAudioElement: null,

  // Callbacks for UI updates
  onStateChange: null,
  onParagraphChange: null,
  onError: null,

  init() {
    this.loadVoices();
    if (this.synth && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }

    try {
      const savedRate = localStorage.getItem('zim_tts_rate');
      if (savedRate) this.rate = parseFloat(savedRate);
      const savedConv = localStorage.getItem('zim_tts_conversational');
      if (savedConv !== null) this.conversationalMode = savedConv === 'true';
      const savedEngine = localStorage.getItem('zim_tts_engine');
      if (savedEngine === 'elevenlabs') this.isElevenLabs = true;
    } catch (e) {}

    return true;
  },

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();

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
    if (voiceURI === 'elevenlabs') {
      this.isElevenLabs = true;
      try { localStorage.setItem('zim_tts_engine', 'elevenlabs'); } catch (e) {}
    } else {
      this.isElevenLabs = false;
      try { localStorage.setItem('zim_tts_engine', 'browser'); } catch (e) {}
      const v = this.voices.find(item => item.voiceURI === voiceURI);
      if (v) this.selectedVoice = v;
    }
  },

  setRate(newRate) {
    this.rate = Math.max(0.5, Math.min(2.0, parseFloat(newRate)));
    try {
      localStorage.setItem('zim_tts_rate', this.rate.toString());
    } catch (e) {}

    if (this.currentAudioElement) {
      this.currentAudioElement.playbackRate = this.rate;
    }

    if (this.isPlaying && !this.isPaused && this.currentParagraphIndex >= 0 && !this.isElevenLabs) {
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
    if (index >= this.paragraphs.length) {
      this.finish();
      return;
    }

    this.currentParagraphIndex = index;
    const item = this.paragraphs[index];

    if (this.onParagraphChange) {
      this.onParagraphChange(item, index);
    }

    // Choice: ElevenLabs HD Streaming VS Browser SpeechSynthesis
    if (this.isElevenLabs) {
      this.playElevenLabsStream(item, index);
    } else {
      this.playBrowserTTS(item, index);
    }
  },

  playBrowserTTS(item, index) {
    if (!this.synth) {
      console.warn('[TTS] No speech synthesizer found.');
      return;
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
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[TTS] Playback error:', e);
        if (this.onError) this.onError(e);
      }
    };

    this.synth.speak(utter);
  },

  async playElevenLabsStream(item, index) {
    try {
      const csrfToken = this.getCSRFToken();
      const res = await fetch('/api/tts/elevenlabs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ text: item.text })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.requires_upgrade) {
          if (window.App && window.App.showToast) {
            window.App.showToast('ElevenLabs AI Voice requires Premium. Falling back to free browser voice.');
          }
          // Fall back gracefully to browser TTS
          this.isElevenLabs = false;
          this.playBrowserTTS(item, index);
          return;
        } else {
          throw new Error(errData.error || 'ElevenLabs speech synthesis failed');
        }
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      this.currentAudioElement = audio;
      audio.playbackRate = this.rate;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (this.isPlaying && !this.isPaused) {
          this.playFromIndex(index + 1);
        }
      };

      audio.onerror = (e) => {
        console.warn('[ElevenLabs Audio] Playback error:', e);
        this.playBrowserTTS(item, index);
      };

      await audio.play();
    } catch (err) {
      console.warn('[TTS] ElevenLabs call failed, falling back to browser:', err);
      if (window.App && window.App.showToast) {
        window.App.showToast(err.message || 'ElevenLabs unavailable, using browser narrator.');
      }
      this.isElevenLabs = false;
      this.playBrowserTTS(item, index);
    }
  },

  pause() {
    if (!this.isPlaying || this.isPaused) return;

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
    } else if (this.synth) {
      this.synth.pause();
    }

    this.isPaused = true;
    this.notifyStateChange();
  },

  resume() {
    if (!this.isPlaying || !this.isPaused) return;

    if (this.currentAudioElement) {
      this.currentAudioElement.play();
    } else if (this.synth) {
      this.synth.resume();
    }

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
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement = null;
    }
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

  getCSRFToken() {
    const match = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
    return match ? match[2] : '';
  },

  notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        isElevenLabs: this.isElevenLabs,
        currentSection: this.currentSection,
        currentPassage: this.currentPassage,
        rate: this.rate,
        conversationalMode: this.conversationalMode
      });
    }
  }
};

window.TTSEngine = TTSEngine;
