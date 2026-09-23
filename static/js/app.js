/**
 * Zimbabwean Constitution Website - Core Application Controller
 * Handles Service Worker registration, routing, reader, search, TTS UI,
 * email authentication, and reading progress tracking.
 */

const App = {
  data: null,
  currentSection: null,
  currentTab: 'chapters',
  theme: 'dark',
  fontSize: 17,
  useSerif: false,
  authTab: 'login',

  init() {
    this.data = window.CONSTITUTION_DATA;
    if (!this.data) {
      console.error('Constitutional data not loaded.');
      return;
    }

    // Initialize subsystems
    window.ConstitutionSearch.init(this.data);
    window.TTSEngine.init();
    if (window.AuthManager) {
      window.AuthManager.onAuthChange = (user) => {
        this.updateUserUI(user);
        this.renderChaptersList();
        if (this.currentSection) {
          this.updateReaderReadState();
        }
      };
      window.AuthManager.init();
    }

    // Setup Theme & Preferences
    this.loadUserPreferences();

    // Register Service Worker & Cache API
    this.setupServiceWorker();
    this.setupNetworkStatus();

    // Render Initial UI
    this.renderChaptersList();
    this.renderVoiceOptions();
    this.renderFilterPills();
    this.setupEventListeners();
    this.setupTTSListeners();
    this.updateUserUI(window.AuthManager ? window.AuthManager.currentUser : null);

    // Handle Deep Linking / Hash routing
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  /* ===================================================================
     SERVICE WORKER & CACHE API INTEGRATION
     =================================================================== */
  setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(registration => {
            console.log('[PWA] Service Worker registered with root scope:', registration.scope);

            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    this.showToast('Updated constitutional version available! Reloading cache...');
                  }
                });
              }
            });

            this.updateCacheStatus(true);
          })
          .catch(error => {
            console.warn('[PWA] Service Worker registration failed:', error);
            this.updateCacheStatus(false);
          });
      });
    }
  },

  setupNetworkStatus() {
    const updateOnlineStatus = () => {
      const isOnline = navigator.onLine;
      const banner = document.getElementById('offlineBanner');
      const statusText = document.getElementById('networkStatusText');
      const dot = document.getElementById('networkDot');

      if (!isOnline) {
        banner.classList.add('is-offline');
        if (dot) dot.classList.add('offline');
        if (statusText) statusText.textContent = 'Offline Mode - 100% Constitution cached & available';
        this.showToast('You are offline. Full constitution is active from local Cache API.');
      } else {
        banner.classList.remove('is-offline');
        if (dot) dot.classList.remove('offline');
        if (statusText) statusText.textContent = 'Online & Synced • Ready for offline access';
        if (window.AuthManager) window.AuthManager.syncOfflineData();
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
  },

  updateCacheStatus(isCached) {
    const cacheBadge = document.getElementById('cacheBadge');
    if (cacheBadge) {
      cacheBadge.textContent = isCached ? 'Cached for Offline' : 'Cache Active';
    }
  },

  /* ===================================================================
     USER PREFERENCES (THEME & FONT)
     =================================================================== */
  loadUserPreferences() {
    try {
      const savedTheme = localStorage.getItem('zim_theme') || 'dark';
      this.setTheme(savedTheme);

      const savedSize = localStorage.getItem('zim_font_size');
      if (savedSize) {
        this.fontSize = parseInt(savedSize, 10);
        this.applyFontSize();
      }

      const savedSerif = localStorage.getItem('zim_serif');
      if (savedSerif === 'true') {
        this.useSerif = true;
        document.body.classList.add('font-serif-active');
      }
    } catch (e) {}
  },

  setTheme(newTheme) {
    this.theme = newTheme;
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('zim_theme', newTheme);
    } catch (e) {}
  },

  cycleTheme() {
    const themes = ['dark', 'light', 'sepia'];
    const nextIdx = (themes.indexOf(this.theme) + 1) % themes.length;
    this.setTheme(themes[nextIdx]);
  },

  changeFontSize(delta) {
    this.fontSize = Math.max(14, Math.min(24, this.fontSize + delta));
    this.applyFontSize();
    try {
      localStorage.setItem('zim_font_size', this.fontSize.toString());
    } catch (e) {}
  },

  applyFontSize() {
    document.documentElement.style.setProperty('--reader-font-size', `${this.fontSize}px`);
  },

  toggleSerif() {
    this.useSerif = !this.useSerif;
    if (this.useSerif) {
      document.body.classList.add('font-serif-active');
    } else {
      document.body.classList.remove('font-serif-active');
    }
    try {
      localStorage.setItem('zim_serif', this.useSerif.toString());
    } catch (e) {}
  },

  /* ===================================================================
     USER AUTHENTICATION & PROGRESS UI
     =================================================================== */
  updateUserUI(user) {
    const btn = document.getElementById('userProfileBtn');
    if (!btn) return;

    if (user) {
      const totalRead = window.AuthManager ? window.AuthManager.getTotalRead() : 0;
      btn.innerHTML = `
        <span class="user-avatar-dot"></span>
        <span>${this.escapeHtml(user.name || user.email.split('@')[0])}</span>
        <span style="font-size:0.7rem; color:var(--gold); margin-left:0.2rem;">(${totalRead}/345)</span>
      `;
      btn.title = `Signed in as ${user.email}. Click for account details.`;
      btn.onclick = () => this.openProfileMenu();
    } else {
      btn.innerHTML = `👤 Sign In`;
      btn.title = `Sign in with email to save reading progress`;
      btn.onclick = () => this.openAuthModal('login');
    }
  },

  openAuthModal(tab = 'login') {
    const backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) {
      backdrop.classList.add('active');
      this.switchAuthTab(tab);
      const emailInput = document.getElementById('authEmail');
      if (emailInput) setTimeout(() => emailInput.focus(), 100);
    }
  },

  closeAuthModal() {
    const backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    const errBox = document.getElementById('authErrorBanner');
    if (errBox) errBox.style.display = 'none';
  },

  switchAuthTab(tab) {
    this.authTab = tab;
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const nameGroup = document.getElementById('authNameGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const subtitle = document.getElementById('authModalSubtitle');

    if (tab === 'register') {
      if (nameGroup) nameGroup.style.display = 'flex';
      if (submitBtn) submitBtn.textContent = 'Create Free Account';
      if (subtitle) subtitle.textContent = 'Sign up by email to track progress across devices';
    } else {
      if (nameGroup) nameGroup.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Sign In';
      if (subtitle) subtitle.textContent = 'Enter your email and password to sync your progress';
    }
  },

  async handleAuthSubmit(e) {
    e.preventDefault();
    const email = (document.getElementById('authEmail') || {}).value || '';
    const password = (document.getElementById('authPassword') || {}).value || '';
    const name = (document.getElementById('authName') || {}).value || '';
    const errBox = document.getElementById('authErrorBanner');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (errBox) errBox.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (this.authTab === 'register') {
        await window.AuthManager.register(email, password, name);
        this.showToast('Account created! Welcome to Zimbabwe Constitution.');
      } else {
        await window.AuthManager.login(email, password);
        this.showToast('Signed in successfully! Progress synced.');
      }
      this.closeAuthModal();
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  openProfileMenu() {
    const user = window.AuthManager ? window.AuthManager.currentUser : null;
    if (!user) {
      this.openAuthModal('login');
      return;
    }

    const totalRead = window.AuthManager.getTotalRead();
    const pct = window.AuthManager.getPercentage();

    const doLogout = confirm(
      `Signed in as:\n${user.email}\n\nReading Progress:\n${totalRead} of 345 sections completed (${pct}%)\n\nWould you like to sign out?`
    );
    if (doLogout) {
      window.AuthManager.logout();
      this.showToast('Signed out.');
    }
  },

  async toggleSectionRead() {
    if (!this.currentSection) return;
    const isNowRead = await window.AuthManager.toggleRead(
      this.currentSection.number,
      this.currentSection.chapterNumber
    );
    this.updateReaderReadState();
    const pct = window.AuthManager.getPercentage();
    this.showToast(isNowRead ? `Section ${this.currentSection.number} marked as read (${pct}% complete)!` : `Section marked as unread.`);
  },

  updateReaderReadState() {
    if (!this.currentSection) return;
    const isRead = window.AuthManager ? window.AuthManager.isSectionRead(this.currentSection.number) : false;
    const btn = document.getElementById('btnMarkRead');
    if (btn) {
      btn.textContent = isRead ? '✓ Completed' : 'Mark as Read';
      btn.classList.toggle('is-read', isRead);
    }
  },

  /* ===================================================================
     NAVIGATION & ROUTING
     =================================================================== */
  switchTab(tabName) {
    this.currentTab = tabName;

    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });

    document.querySelectorAll('.desktop-nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });

    if (tabName === 'bookmarks') {
      this.renderBookmarksList();
    } else if (tabName === 'search') {
      setTimeout(() => {
        const inp = document.getElementById('searchInput');
        if (inp) inp.focus();
      }, 100);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  handleRoute() {
    const hash = window.location.hash;
    if (!hash || hash === '#') {
      this.switchTab('chapters');
      return;
    }

    if (hash.startsWith('#section-')) {
      const secNum = parseInt(hash.replace('#section-', ''), 10);
      this.openSection(secNum);
    } else if (hash.startsWith('#chapter-')) {
      const chNum = parseInt(hash.replace('#chapter-', ''), 10);
      this.switchTab('chapters');
      this.expandChapter(chNum);
    } else if (hash === '#preamble') {
      this.openPreamble();
    } else if (['chapters', 'search', 'audio', 'bookmarks', 'overview'].includes(hash.substring(1))) {
      this.switchTab(hash.substring(1));
    }
  },

  /* ===================================================================
     CHAPTERS ACCORDION & PROGRESS CARD
     =================================================================== */
  renderChaptersList() {
    const container = document.getElementById('chaptersContainer');
    if (!container) return;

    const totalRead = window.AuthManager ? window.AuthManager.getTotalRead() : 0;
    const pct = window.AuthManager ? window.AuthManager.getPercentage() : 0;
    const lastSection = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.last_section_number : 1;

    let html = `
      <!-- User Reading Progress Card -->
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-title">📊 Your Constitutional Progress</span>
          <span class="progress-stats"><strong>${totalRead}</strong> / 345 sections (${pct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="progress-footer">
          <span>${pct >= 100 ? '🎉 Entire Constitution Completed!' : 'Keep reading to complete Zimbabwe\'s Supreme Law'}</span>
          <button class="btn-resume" onclick="App.openSection(${lastSection})">
            Resume Section ${lastSection} →
          </button>
        </div>
      </div>

      <div class="chapter-card" style="border-left: 4px solid var(--gold);">
        <div class="chapter-header" onclick="App.openPreamble()">
          <div class="ch-info">
            <span class="ch-tag">Founding Charter</span>
            <h3 class="ch-title">Preamble</h3>
            <span class="ch-meta">"We the people of Zimbabwe..."</span>
          </div>
          <span class="btn-mini-listen">Read →</span>
        </div>
      </div>
    `;

    this.data.chapters.forEach(ch => {
      const sectionCount = ch.sections.length;
      const firstSec = ch.sections[0] ? ch.sections[0].number : '';
      const lastSec = ch.sections[sectionCount - 1] ? ch.sections[sectionCount - 1].number : '';
      const rangeText = sectionCount > 0 ? `Sections ${firstSec} – ${lastSec} (${sectionCount} sections)` : 'Overview';

      // Count read in this chapter
      let chReadCount = 0;
      if (window.AuthManager) {
        ch.sections.forEach(s => {
          if (window.AuthManager.isSectionRead(s.number)) chReadCount++;
        });
      }

      html += `
        <div class="chapter-card" id="chapterCard-${ch.number}">
          <div class="chapter-header" onclick="App.toggleChapter(${ch.number})">
            <div class="ch-info">
              <span class="ch-tag">
                Chapter ${ch.number}
                ${chReadCount > 0 ? `<span class="read-badge">${chReadCount}/${sectionCount} read</span>` : ''}
              </span>
              <h3 class="ch-title">${this.escapeHtml(ch.title)}</h3>
              <span class="ch-meta">${rangeText}</span>
            </div>
            <span class="ch-chevron">▼</span>
          </div>
          <div class="sections-list" id="sectionsList-${ch.number}">
            ${ch.sections.map(sec => {
              const isRead = window.AuthManager ? window.AuthManager.isSectionRead(sec.number) : false;
              return `
                <div class="section-item" onclick="App.openSection(${sec.number})">
                  <div class="sec-left">
                    <span class="sec-num">${sec.number}</span>
                    <span class="sec-title">
                      ${this.escapeHtml(sec.title)}
                      ${isRead ? '<span class="read-badge">✓ Read</span>' : ''}
                    </span>
                  </div>
                  <div class="sec-actions">
                    <button class="btn-mini-listen" onclick="event.stopPropagation(); App.quickPlaySection(${sec.number})" title="Play conversational audio">
                      🎧 Listen
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  toggleChapter(chNumber) {
    const card = document.getElementById(`chapterCard-${chNumber}`);
    if (card) card.classList.toggle('expanded');
  },

  expandChapter(chNumber) {
    const card = document.getElementById(`chapterCard-${chNumber}`);
    if (card) {
      card.classList.add('expanded');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  /* ===================================================================
     READER VIEW
     =================================================================== */
  findSection(secNum) {
    for (const ch of this.data.chapters) {
      const s = ch.sections.find(item => item.number === Number(secNum));
      if (s) return s;
    }
    return null;
  },

  openSection(secNum) {
    const section = this.findSection(secNum);
    if (!section) return;

    this.currentSection = section;
    window.location.hash = `#section-${secNum}`;
    window.BookmarksManager.recordHistory(section);

    const isBookmarked = window.BookmarksManager.isBookmarked(secNum);
    const existingNote = window.BookmarksManager.getNote(secNum);
    const isRead = window.AuthManager ? window.AuthManager.isSectionRead(secNum) : false;

    const paragraphs = section.content.split('\n\n').filter(p => p.trim());
    const formattedParagraphs = paragraphs.length > 0 
      ? paragraphs.map((p, idx) => `
          <div class="reader-paragraph" id="para-${idx}" onclick="App.speakPassageFromElement(this, ${idx})">
            ${this.formatParagraphText(p)}
            <span class="speak-hint">▶ Play passage</span>
          </div>
        `).join('')
      : `<div class="reader-paragraph" id="para-0">${this.escapeHtml(section.content)}</div>`;

    const html = `
      <div class="reader-container">
        <div class="reader-toolbar">
          <button class="reader-nav-btn" onclick="App.switchTab('chapters')">
            ← Back to Chapters
          </button>
          <div class="reader-controls-right">
            <button class="btn-mark-read ${isRead ? 'is-read' : ''}" id="btnMarkRead" onclick="App.toggleSectionRead()" title="Track your reading progress">
              ${isRead ? '✓ Completed' : 'Mark as Read'}
            </button>
            <button class="btn-pill" onclick="App.toggleSerif()" title="Toggle Serif / Sans-serif">
              ${this.useSerif ? 'Sans' : 'Serif'}
            </button>
            <button class="btn-pill" onclick="App.changeFontSize(-1)" title="Smaller text">A-</button>
            <button class="btn-pill" onclick="App.changeFontSize(1)" title="Larger text">A+</button>
            <button class="btn-pill ${isBookmarked ? 'active' : ''}" id="btnBookmark" onclick="App.toggleBookmarkCurrent()">
              ${isBookmarked ? '★ Saved' : '☆ Bookmark'}
            </button>
          </div>
        </div>

        <div class="reader-meta-tag">Chapter ${section.chapterNumber}: ${this.escapeHtml(section.chapterTitle)}</div>
        <h1 class="reader-heading">Section ${section.number}. ${this.escapeHtml(section.title)}</h1>

        <!-- Conversational Explainer Card -->
        <div class="conversational-box">
          <div class="conv-header">
            <span class="conv-badge">💬 Plain English Summary</span>
            <button class="btn-listen-explainer" onclick="App.quickPlaySection(${section.number})">
              ▶ Listen with TTS
            </button>
          </div>
          <p class="conv-text">${this.escapeHtml(section.summary)}</p>
        </div>

        <!-- Section Legal Text -->
        <div class="reader-body" id="readerBody">
          ${formattedParagraphs}
        </div>

        <!-- User Civic Study Notes -->
        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <span style="font-size:0.8rem; font-weight:700; color:var(--gold);">📝 Personal Notes for Section ${section.number}</span>
            <span id="noteSaveStatus" style="font-size:0.75rem; color:var(--text-dim);"></span>
          </div>
          <textarea id="sectionNoteInput" 
            style="width:100%; height:70px; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-main); border-radius:6px; padding:0.5rem; font-size:0.85rem; outline:none; resize:vertical;" 
            placeholder="Add legal analysis, court notes, or study thoughts here...">${this.escapeHtml(existingNote)}</textarea>
          <div style="margin-top:0.4rem; text-align:right;">
            <button class="btn-pill" onclick="App.saveCurrentNote()">Save Note</button>
          </div>
        </div>

        <!-- Prev / Next Navigation -->
        <div class="reader-bottom-nav">
          ${section.number > 1 ? `
            <button class="btn-nav-sec" onclick="App.openSection(${section.number - 1})">
              ← Section ${section.number - 1}
            </button>
          ` : '<div></div>'}
          ${section.number < 345 ? `
            <button class="btn-nav-sec" onclick="App.openSection(${section.number + 1})">
              Section ${section.number + 1} →
            </button>
          ` : '<div></div>'}
        </div>
      </div>
    `;

    const container = document.getElementById('tab-reader');
    if (container) {
      container.innerHTML = html;
      this.switchTab('reader');
    }
  },

  openPreamble() {
    window.location.hash = '#preamble';
    const html = `
      <div class="reader-container">
        <div class="reader-toolbar">
          <button class="reader-nav-btn" onclick="App.switchTab('chapters')">
            ← Back to Chapters
          </button>
          <div class="reader-controls-right">
            <button class="btn-pill" onclick="App.toggleSerif()">
              ${this.useSerif ? 'Sans' : 'Serif'}
            </button>
            <button class="btn-pill" onclick="App.changeFontSize(-1)">A-</button>
            <button class="btn-pill" onclick="App.changeFontSize(1)">A+</button>
          </div>
        </div>

        <div class="reader-meta-tag">Constitution of Zimbabwe</div>
        <h1 class="reader-heading">Preamble</h1>

        <div class="conversational-box">
          <div class="conv-header">
            <span class="conv-badge">💬 Overview</span>
            <button class="btn-listen-explainer" onclick="App.quickPlayPreamble()">
              ▶ Listen to Preamble
            </button>
          </div>
          <p class="conv-text">The Preamble is the philosophical cornerstone of Zimbabwe's 2013 Constitution, declaring popular sovereignty, historical resistance to colonial domination, equality, and national reconciliation.</p>
        </div>

        <div class="reader-body">
          ${this.data.preamble.split('\n\n').map((para, idx) => `
            <div class="reader-paragraph" id="para-${idx}" onclick="App.speakPassageFromElement(this, ${idx})">
              ${this.escapeHtml(para)}
              <span class="speak-hint">▶ Play passage</span>
            </div>
          `).join('')}
        </div>

        <div class="reader-bottom-nav">
          <div></div>
          <button class="btn-nav-sec" onclick="App.openSection(1)">
            Chapter 1: Section 1 →
          </button>
        </div>
      </div>
    `;

    const container = document.getElementById('tab-reader');
    if (container) {
      container.innerHTML = html;
      this.switchTab('reader');
    }
  },

  formatParagraphText(text) {
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  },

  toggleBookmarkCurrent() {
    if (!this.currentSection) return;
    const isNow = window.BookmarksManager.toggleBookmark(this.currentSection);
    const btn = document.getElementById('btnBookmark');
    if (btn) {
      btn.textContent = isNow ? '★ Saved' : '☆ Bookmark';
      btn.classList.toggle('active', isNow);
    }
    this.showToast(isNow ? 'Section added to bookmarks!' : 'Bookmark removed.');
    if (window.AuthManager) window.AuthManager.syncOfflineData();
  },

  saveCurrentNote() {
    if (!this.currentSection) return;
    const inp = document.getElementById('sectionNoteInput');
    const status = document.getElementById('noteSaveStatus');
    if (inp) {
      window.BookmarksManager.saveNote(this.currentSection.number, inp.value);
      if (status) {
        status.textContent = 'Saved to device storage';
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
      }
      if (window.AuthManager) window.AuthManager.syncOfflineData();
    }
  },

  /* ===================================================================
     SEARCH ENGINE UI
     =================================================================== */
  renderFilterPills() {
    const pills = [
      { id: 'all', label: 'All Chapters' },
      { id: '4', label: 'Bill of Rights (Ch 4)' },
      { id: '1', label: 'Founding (Ch 1)' },
      { id: '3', label: 'Citizenship (Ch 3)' },
      { id: '5', label: 'Executive (Ch 5)' },
      { id: '6', label: 'Legislature (Ch 6)' },
      { id: '7', label: 'Elections (Ch 7)' },
      { id: '8', label: 'Judiciary (Ch 8)' },
      { id: '16', label: 'Agricultural Land (Ch 16)' }
    ];

    const container = document.getElementById('filterPills');
    if (!container) return;

    container.innerHTML = pills.map((p, idx) => `
      <button class="filter-pill ${idx === 0 ? 'active' : ''}" data-filter="${p.id}" onclick="App.applySearchFilter('${p.id}', this)">
        ${p.label}
      </button>
    `).join('');
  },

  applySearchFilter(filterVal, btn) {
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.activeSearchFilter = filterVal;
    this.executeSearch();
  },

  executeSearch() {
    const query = (document.getElementById('searchInput') || {}).value || '';
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    if (!query.trim()) {
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-dim);">
          <div style="font-size:2rem; margin-bottom:0.5rem;">🔍</div>
          <p>Search all 345 sections, keywords, or section numbers (e.g. "56", "freedom of expression", "citizenship")</p>
        </div>
      `;
      return;
    }

    const results = window.ConstitutionSearch.search(query, this.activeSearchFilter || 'all');
    const terms = query.trim().split(/\s+/);

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
          <p>No constitutional sections found matching "${this.escapeHtml(query)}".</p>
        </div>
      `;
      return;
    }

    let html = `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Found ${results.length} matches</div>`;
    html += results.map(r => {
      const item = r.item;
      const titleHighlighted = window.ConstitutionSearch.highlight(item.title, terms);
      const snippetHighlighted = window.ConstitutionSearch.highlight(r.snippet, terms);

      return `
        <div class="search-card" onclick="App.openSection(${item.number})">
          <div class="search-card-meta">Chapter ${item.chapterNumber}: ${this.escapeHtml(item.chapterTitle)}</div>
          <h4 class="search-card-title">Section ${item.number}. ${titleHighlighted}</h4>
          <p class="search-snippet">${snippetHighlighted}</p>
        </div>
      `;
    }).join('');

    resultsContainer.innerHTML = html;
  },

  /* ===================================================================
     CONVERSATIONAL TEXT-TO-SPEECH (TTS) UI & CONTROLS
     =================================================================== */
  setupTTSListeners() {
    window.TTSEngine.onStateChange = (state) => {
      this.updateAudioUI(state);
    };

    window.TTSEngine.onParagraphChange = (item, index) => {
      document.querySelectorAll('.reader-paragraph').forEach(el => {
        el.classList.remove('speaking-active');
      });

      if (index >= 0) {
        const el = document.getElementById(`para-${index}`);
        if (el) {
          el.classList.add('speaking-active');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };
  },

  updateAudioUI(state) {
    const miniBar = document.getElementById('miniAudioBar');
    const miniTitle = document.getElementById('miniTrackTitle');
    const miniSub = document.getElementById('miniTrackSub');
    const miniBtnPlay = document.getElementById('miniBtnPlay');

    const loungeTitle = document.getElementById('loungeTitle');
    const loungeTag = document.getElementById('loungeTag');
    const loungeBtnPlay = document.getElementById('loungeBtnPlay');

    if (state.currentSection) {
      if (miniBar) miniBar.classList.add('active');
      const title = `Section ${state.currentSection.number}: ${state.currentSection.title}`;
      const sub = `Chapter ${state.currentSection.chapterNumber} • ${state.conversationalMode ? 'Conversational Mode' : 'Verbatim'}`;

      if (miniTitle) miniTitle.textContent = title;
      if (miniSub) miniSub.textContent = sub;
      if (loungeTitle) loungeTitle.textContent = title;
      if (loungeTag) loungeTag.textContent = `Chapter ${state.currentSection.chapterNumber}`;
    }

    const icon = state.isPlaying && !state.isPaused ? '⏸' : '▶';
    if (miniBtnPlay) miniBtnPlay.textContent = icon;
    if (loungeBtnPlay) loungeBtnPlay.textContent = icon;
  },

  quickPlaySection(secNum) {
    const section = this.findSection(secNum);
    if (!section) return;
    this.openSection(secNum);
    window.TTSEngine.speakSection(section);
  },

  quickPlayPreamble() {
    const preambleSection = {
      number: 0,
      title: 'Preamble to the Constitution',
      chapterNumber: 0,
      chapterTitle: 'Founding Charter',
      content: this.data.preamble,
      summary: 'The founding declaration of sovereignty, freedom, justice, and human rights for the Republic of Zimbabwe.'
    };
    window.TTSEngine.speakSection(preambleSection);
  },

  speakPassageFromElement(element, index) {
    const text = element.innerText.replace('▶ Play passage', '').trim();
    if (text) {
      window.TTSEngine.speakSelectedPassage(text, this.currentSection);
    }
  },

  toggleAudioPlay() {
    if (window.TTSEngine.isPlaying && !window.TTSEngine.isPaused) {
      window.TTSEngine.pause();
    } else if (window.TTSEngine.isPaused) {
      window.TTSEngine.resume();
    } else if (this.currentSection) {
      window.TTSEngine.speakSection(this.currentSection);
    } else {
      this.quickPlaySection(1);
    }
  },

  renderVoiceOptions() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;

    const voices = window.TTSEngine.voices;
    if (voices.length === 0) {
      select.innerHTML = '<option value="">Default Conversational Voice</option>';
      return;
    }

    select.innerHTML = voices.map(v => `
      <option value="${v.voiceURI}" ${v === window.TTSEngine.selectedVoice ? 'selected' : ''}>
        ${v.name} (${v.lang})
      </option>
    `).join('');
  },

  /* ===================================================================
     BOOKMARKS & NOTES LIST VIEW
     =================================================================== */
  renderBookmarksList() {
    const container = document.getElementById('bookmarksList');
    if (!container) return;

    const bookmarks = window.BookmarksManager.getBookmarks();
    if (bookmarks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size:2rem; margin-bottom:0.5rem;">★</div>
          <p>No saved bookmarks yet. Tap the bookmark button on any section to save it here for quick reference.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = bookmarks.map(b => {
      const note = window.BookmarksManager.getNote(b.number);
      return `
        <div class="search-card" onclick="App.openSection(${b.number})">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="search-card-meta">Chapter ${b.chapterNumber}: ${this.escapeHtml(b.chapterTitle || '')}</div>
            <button class="btn-pill" onclick="event.stopPropagation(); App.removeBookmark(${b.number})" style="color:var(--crimson);">Remove</button>
          </div>
          <h4 class="search-card-title">Section ${b.number}. ${this.escapeHtml(b.title)}</h4>
          ${note ? `
            <div style="margin-top:0.4rem; padding:0.5rem; background:var(--bg-card); border-left:3px solid var(--gold); font-size:0.8rem; color:var(--text-main);">
              <strong>Note:</strong> ${this.escapeHtml(note)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  removeBookmark(secNum) {
    const section = this.findSection(secNum);
    if (section) {
      window.BookmarksManager.toggleBookmark(section);
      this.renderBookmarksList();
      this.showToast('Bookmark removed');
    }
  },

  /* ===================================================================
     EVENT LISTENERS & UTILITIES
     =================================================================== */
  setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.executeSearch(), 200);
      });
    }

    const speedSelect = document.getElementById('speedSelect');
    if (speedSelect) {
      speedSelect.value = window.TTSEngine.rate.toString();
      speedSelect.addEventListener('change', (e) => {
        window.TTSEngine.setRate(e.target.value);
      });
    }

    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        window.TTSEngine.setVoice(e.target.value);
      });
    }

    const convCheckbox = document.getElementById('convModeCheckbox');
    if (convCheckbox) {
      convCheckbox.checked = window.TTSEngine.conversationalMode;
      convCheckbox.addEventListener('change', (e) => {
        window.TTSEngine.setConversationalMode(e.target.checked);
      });
    }
  },

  showToast(message) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #1b261f;
        color: #f1f5f9;
        border: 1px solid var(--gold-border);
        padding: 0.6rem 1.2rem;
        border-radius: 20px;
        font-size: 0.85rem;
        z-index: 100;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        pointer-events: none;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
