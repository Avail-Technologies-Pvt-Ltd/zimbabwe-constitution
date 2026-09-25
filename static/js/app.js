/**
 * Zimbabwean Constitution Website - Core Application Controller
 * Handles Service Worker registration, routing, reader, search, TTS UI,
 * email authentication, and reading progress tracking.
 */

const App = {
  data: null,
  currentSection: null,
  currentTab: 'chapters',
  theme: 'warm',
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
    this.updateSpeedButtonLabel();
    this.updateVoiceButtonLabel();
    this.renderFilterPills();
    this.setupEventListeners();
    this.setupTTSListeners();
    this.updateUserUI(window.AuthManager ? window.AuthManager.currentUser : null);

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this.updateVoiceButtonLabel();
      });
    }

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
        if (banner) banner.classList.add('is-offline');
        if (dot) dot.classList.add('offline');
        if (statusText) statusText.textContent = 'Offline Mode - 100% Constitution cached & available';
        this.showToast('You are offline. Full constitution is active from local Cache API.', 'info');
      } else {
        if (banner) banner.classList.remove('is-offline');
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
      const savedTheme = localStorage.getItem('zim_theme') || 'warm';
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
    const themes = ['warm', 'dark', 'sepia'];
    const nextIdx = (themes.indexOf(this.theme) + 1) % themes.length;
    this.setTheme(themes[nextIdx]);
    const labels = {
      'warm': 'Warm Sunlit Ivory',
      'dark': 'Warm Sunset Roast',
      'sepia': 'Golden Antiquarian'
    };
    this.showToast(`Theme: ${labels[themes[nextIdx]] || themes[nextIdx]}`);
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
      btn.innerHTML = `<i class="fa-regular fa-user"></i> Sign In`;
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

  async openProfileMenu() {
    const user = window.AuthManager ? window.AuthManager.currentUser : null;
    if (!user) {
      this.openAuthModal('login');
      return;
    }

    const totalRead = window.AuthManager.getTotalRead();
    const pct = window.AuthManager.getPercentage();
    const isPremium = user.is_premium;

    const result = await Swal.fire({
      title: user.name || 'Citizen Profile',
      html: `
        <div style="text-align:left; font-size:0.92rem; line-height:1.8; color:var(--text-muted); margin-top:0.5rem;">
          <div><strong style="color:var(--text-main);">Email:</strong> ${this.escapeHtml(user.email)}</div>
          <div><strong style="color:var(--text-main);">Reading Progress:</strong> ${totalRead} of 345 sections (${pct}%)</div>
          <div><strong style="color:var(--text-main);">Account Tier:</strong> ${isPremium ? '<span style="color:#16a34a; font-weight:700;"><i class="fa-solid fa-crown"></i> Premium (ElevenLabs HD Voice)</span>' : 'Standard Free'}</div>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: isPremium ? 'Switch to Standard Tier' : 'Activate Premium Pass',
      confirmButtonColor: '#2563eb',
      denyButtonText: 'Sign Out',
      denyButtonColor: '#ef4444',
      cancelButtonText: 'Close',
      cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
      this.toggleDemoPremium();
    } else if (result.isDenied) {
      window.AuthManager.logout();
      this.showToast('Signed out successfully.');
    }
  },

  async toggleDemoPremium() {
    try {
      const res = await fetch('/api/tts/toggle-demo-premium/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': window.AuthManager ? window.AuthManager.getCSRFToken() : ''
        }
      });
      const data = await res.json();
      if (res.ok && window.AuthManager && window.AuthManager.currentUser) {
        window.AuthManager.currentUser.is_premium = data.is_premium;
        window.AuthManager.saveOfflineProgress();
        this.updateUserUI(window.AuthManager.currentUser);
        this.renderVoiceOptions();
        this.showToast(`Tier updated: ${data.is_premium ? '🌟 Premium Active (ElevenLabs enabled)' : 'Standard Free Tier'}`);
      }
    } catch (e) {
      console.error('Failed to toggle demo premium:', e);
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

    // Reset reading scroll progress bar if leaving blog
    const scrollBar = document.getElementById('chapterScrollProgress');
    if (scrollBar && tabName !== 'chapter-blog') {
      scrollBar.style.width = '0%';
    }

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
    } else if (hash.startsWith('#chapter-blog-')) {
      const chNum = parseInt(hash.replace('#chapter-blog-', ''), 10);
      this.openChapterBlog(chNum);
    } else if (hash.startsWith('#chapter-')) {
      const chNum = parseInt(hash.replace('#chapter-', ''), 10);
      this.openChapterBlog(chNum);
    } else if (hash === '#preamble') {
      this.openPreamble();
    } else if (['chapters', 'chapter-blog', 'search', 'audio', 'bookmarks', 'overview'].includes(hash.substring(1))) {
      this.switchTab(hash.substring(1));
    }
  },

  /* ===================================================================
     BOOK TABLE OF CONTENTS (TOC)
     =================================================================== */
  renderChaptersList() {
    const container = document.getElementById('chaptersContainer');
    if (!container) return;

    const totalRead = window.AuthManager ? window.AuthManager.getTotalRead() : 0;
    const pct = window.AuthManager ? window.AuthManager.getPercentage() : 0;

    // Update overall header meta
    const progressMeta = document.getElementById('overallProgressText');
    if (progressMeta) {
      progressMeta.innerHTML = `<span class="toc-progress-text"><i class="fa-solid fa-bookmark" style="color:var(--gold);"></i> ${totalRead} of 345 sections completed (${pct}%)</span>`;
    }

    let html = `
      <!-- Preamble TOC Entry -->
      <div class="toc-entry" id="trackRow-0">
        <div class="toc-entry-left" onclick="App.openPreamble()">
          <span class="toc-roman-num"><i class="fa-solid fa-scroll"></i></span>
          <div class="toc-title-group">
            <h3 class="toc-entry-title">Preamble</h3>
            <span class="toc-entry-sub">Founding Charter & Sovereign Proclamation</span>
          </div>
        </div>
        <div class="toc-entry-right" onclick="event.stopPropagation()">
          <button class="btn-toc-action" onclick="App.quickPlayPreamble()" title="Listen to Preamble">
            <i class="fa-solid fa-headphones"></i> <span>Listen</span>
          </button>
          <button class="btn-toc-action btn-toc-read" onclick="App.openPreamble()" title="Read Preamble">
            <i class="fa-solid fa-book-open"></i> <span>Read</span>
          </button>
        </div>
      </div>
    `;

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII'];

    this.data.chapters.forEach(ch => {
      const sectionCount = ch.sections.length;
      const firstSec = ch.sections[0] ? ch.sections[0].number : '';
      const lastSec = ch.sections[sectionCount - 1] ? ch.sections[sectionCount - 1].number : '';
      const rangeText = sectionCount > 0 ? `Sections ${firstSec} to ${lastSec}` : 'Overview';

      let chReadCount = 0;
      if (window.AuthManager) {
        ch.sections.forEach(s => {
          if (window.AuthManager.isSectionRead(s.number)) chReadCount++;
        });
      }

      const roman = romanNumerals[ch.number - 1] || ch.number;

      html += `
        <div class="toc-entry" id="trackRow-${ch.number}">
          <div class="toc-entry-left" onclick="App.openChapterBlog(${ch.number})">
            <span class="toc-roman-num">Chapter ${roman}</span>
            <div class="toc-title-group">
              <h3 class="toc-entry-title">${this.escapeHtml(ch.title)}</h3>
              <span class="toc-entry-sub">${rangeText} ${chReadCount > 0 ? `• <span class="toc-read-badge"><i class="fa-solid fa-check"></i> ${chReadCount}/${sectionCount} read</span>` : ''}</span>
            </div>
          </div>
          <div class="toc-entry-right" onclick="event.stopPropagation()">
            <button class="btn-toc-action" onclick="App.playChapterContinuous(${ch.number})" title="Listen to Chapter ${ch.number}">
              <i class="fa-solid fa-headphones"></i> <span>Listen</span>
            </button>
            <button class="btn-toc-action btn-toc-read" onclick="App.openChapterBlog(${ch.number})" title="Read Chapter ${ch.number}">
              <i class="fa-solid fa-book-open"></i> <span>Read</span>
            </button>
            <button class="btn-toc-expand" onclick="App.toggleChapter(${ch.number})" title="View Clauses">
              <i class="fa-solid fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <div class="toc-clauses-wrapper" id="sectionsList-${ch.number}">
          ${ch.sections.map(sec => {
            const isRead = window.AuthManager ? window.AuthManager.isSectionRead(sec.number) : false;
            return `
              <div class="toc-clause-row" onclick="App.openSection(${sec.number})">
                <div class="toc-clause-left">
                  <span class="toc-section-symbol">§ ${sec.number}</span>
                  <span class="toc-clause-title">
                    ${this.escapeHtml(sec.title)}
                    ${isRead ? ' <span class="clause-read-icon"><i class="fa-solid fa-check"></i></span>' : ''}
                  </span>
                </div>
                <button class="btn-clause-listen" onclick="event.stopPropagation(); App.playChapterContinuous(${ch.number}, ${sec.number})" title="Listen to § ${sec.number}">
                  <i class="fa-solid fa-headphones"></i>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    });

    container.innerHTML = html;
  },

  toggleChapter(chNumber) {
    const row = document.getElementById(`trackRow-${chNumber}`);
    const list = document.getElementById(`sectionsList-${chNumber}`);
    if (row && list) {
      const isExpanded = row.classList.contains('expanded');
      row.classList.toggle('expanded', !isExpanded);
      list.style.display = isExpanded ? 'none' : 'block';
    }
  },

  /* ===================================================================
     BOOK CHAPTER EDITORIAL READING VIEW & PROGRESS
     =================================================================== */
  setupReadingScrollProgress() {
    const scrollBar = document.getElementById('chapterScrollProgress');
    if (!scrollBar) return;
    const updateProgress = () => {
      if (this.currentTab !== 'chapter-blog') return;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = (window.scrollY / totalHeight) * 100;
        scrollBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      }
    };
    if (this._scrollHandler) {
      window.removeEventListener('scroll', this._scrollHandler);
    }
    this._scrollHandler = updateProgress;
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  },

  findChapter(chNumber) {
    return this.data.chapters.find(c => c.number === Number(chNumber)) || null;
  },

  openChapterBlog(chNumber) {
    const ch = this.findChapter(chNumber);
    if (!ch) {
      this.switchTab('chapters');
      return;
    }

    this.currentChapter = ch;
    window.location.hash = `#chapter-blog-${ch.number}`;
    this.switchTab('chapter-blog');

    // Calculate word count and estimated reading time
    const totalWords = ch.sections.reduce((acc, s) => {
      const count = s.content ? s.content.trim().split(/\s+/).length : 0;
      return acc + count;
    }, 0);
    const readingMins = Math.max(2, Math.round(totalWords / 200));

    // Section counts and read status
    const sectionCount = ch.sections.length;
    let chReadCount = 0;
    if (window.AuthManager) {
      ch.sections.forEach(s => {
        if (window.AuthManager.isSectionRead(s.number)) chReadCount++;
      });
    }

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII'];
    const roman = romanNumerals[ch.number - 1] || ch.number;

    const firstSec = ch.sections[0] ? ch.sections[0].number : 1;
    const lastSec = ch.sections[sectionCount - 1] ? ch.sections[sectionCount - 1].number : 1;

    let html = `
      <div class="book-page-wrapper">
        
        <!-- Book Page Running Head -->
        <div class="page-running-head">
          <button class="btn-folio-nav" onclick="App.switchTab('chapters')">
            <i class="fa-solid fa-arrow-left-long"></i> Table of Contents
          </button>
          <div class="running-head-center">
            <span class="running-head-book">CONSTITUTION OF ZIMBABWE</span>
            <span class="running-head-chap">CHAPTER ${roman}</span>
          </div>
          <div class="running-head-actions">
            <button class="btn-folio-tool" onclick="App.changeFontSize(-1)" title="Smaller text">A-</button>
            <button class="btn-folio-tool" onclick="App.changeFontSize(1)" title="Larger text">A+</button>
            <button class="btn-folio-tool" onclick="App.toggleSerif()" title="Toggle Typeface">${this.useSerif ? 'Sans' : 'Serif'}</button>
          </div>
        </div>

        <!-- Chapter Title Opening -->
        <div class="chapter-opening-header">
          <div class="chapter-opening-label">CHAPTER ${roman}</div>
          <h1 class="chapter-opening-title">${this.escapeHtml(ch.title)}</h1>
          <div class="chapter-opening-rule">
            <span class="ornament">❧</span>
          </div>
          <div class="chapter-opening-meta">
            <span>Sections ${firstSec} to ${lastSec}</span>
            <span class="meta-sep">•</span>
            <span>~${readingMins} min read</span>
            <span class="meta-sep">•</span>
            <span id="blogReadCounter"><strong id="blogReadCountText">${chReadCount}</strong> of ${sectionCount} read</span>
          </div>
          <div class="chapter-opening-actions">
            <button class="btn-book-primary" onclick="App.playChapterContinuous(${ch.number})">
              <i class="fa-solid fa-headphones"></i> Listen to Chapter
            </button>
            <button class="btn-book-secondary" onclick="App.scrollToBlogSection(${firstSec})">
              <i class="fa-solid fa-arrow-down"></i> Begin Reading
            </button>
          </div>
        </div>

        <!-- Section Reading Blocks -->
        <div class="book-sections-body">
          ${ch.sections.map(sec => {
            const isRead = window.AuthManager ? window.AuthManager.isSectionRead(sec.number) : false;
            const isBookmarked = window.BookmarksManager ? window.BookmarksManager.isBookmarked(sec.number) : false;
            return `
              <article class="book-section-leaf" id="blog-sec-${sec.number}">
                <div class="leaf-header">
                  <span class="leaf-sec-symbol">§ ${sec.number}</span>
                  <div class="leaf-actions">
                    <button class="btn-leaf-action" onclick="App.playChapterContinuous(${ch.number}, ${sec.number})" title="Listen from § ${sec.number}">
                      <i class="fa-solid fa-headphones"></i>
                    </button>
                    <button class="btn-leaf-action ${isRead ? 'is-read' : ''}" id="btnBlogRead-${sec.number}" onclick="App.toggleBlogSectionRead(${sec.number}, ${ch.number})" title="${isRead ? 'Marked as read' : 'Mark as read'}">
                      <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn-leaf-action ${isBookmarked ? 'is-bookmarked' : ''}" id="btnBlogBookmark-${sec.number}" onclick="App.toggleBlogBookmark(${sec.number})" title="Dog-ear (Bookmark)">
                      <i class="fa-${isBookmarked ? 'solid' : 'regular'} fa-bookmark"></i>
                    </button>
                  </div>
                </div>

                <h2 class="leaf-sec-title">${this.escapeHtml(sec.title)}</h2>

                ${sec.summary ? `
                  <aside class="book-marginalia-note">
                    <div class="marginalia-tag"><i class="fa-solid fa-feather-pointed"></i> Commentary & Plain-English Context</div>
                    <p class="marginalia-text">${this.escapeHtml(sec.summary)}</p>
                  </aside>
                ` : ''}

                <div class="leaf-sec-body">
                  ${sec.content.split('\n\n').filter(p => p.trim()).map((p) => `
                    <div class="reader-paragraph book-paragraph" onclick="App.speakBlogPassage(this, ${sec.number})">
                      ${this.formatParagraphText(p)}
                      <span class="speak-hint"><i class="fa-solid fa-headphones" style="font-size:0.65rem;"></i> Read passage</span>
                    </div>
                  `).join('')}
                </div>
              </article>
            `;
          }).join('')}
        </div>

        <!-- Book Page Turn Navigation -->
        <div class="book-page-turn-footer">
          <div>
            ${ch.number > 1 ? `
              <button class="btn-page-turn" onclick="App.openChapterBlog(${ch.number - 1})">
                <i class="fa-solid fa-arrow-left-long"></i> Chapter ${romanNumerals[ch.number - 2] || (ch.number - 1)}
              </button>
            ` : '<span class="page-turn-placeholder">First Chapter</span>'}
          </div>
          <button class="btn-page-turn btn-page-top" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">
            <i class="fa-solid fa-arrow-up"></i> Top of Page
          </button>
          <div>
            ${ch.number < 18 ? `
              <button class="btn-page-turn" onclick="App.openChapterBlog(${ch.number + 1})">
                Chapter ${romanNumerals[ch.number] || (ch.number + 1)} <i class="fa-solid fa-arrow-right-long"></i>
              </button>
            ` : '<span class="page-turn-placeholder">End of Volume</span>'}
          </div>
        </div>

      </div>
    `;

    const pane = document.getElementById('tab-chapter-blog');
    if (pane) {
      pane.innerHTML = html;
      this.bindBlogScrollProgress();
    }
  },

  scrollToBlogSection(secNum) {
    const el = document.getElementById(`blog-sec-${secNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  bindBlogScrollProgress() {
    if (this._blogScrollListener) {
      window.removeEventListener('scroll', this._blogScrollListener);
    }

    this._blogScrollListener = () => {
      const scrollBar = document.getElementById('chapterScrollProgress');
      if (!scrollBar) return;

      const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (height > 0) {
        const scrolled = Math.min(100, Math.max(0, (winScroll / height) * 100));
        scrollBar.style.width = scrolled + '%';
      }
    };

    window.addEventListener('scroll', this._blogScrollListener, { passive: true });
    this._blogScrollListener();
  },

  async toggleBlogSectionRead(secNum, chNum) {
    if (!window.AuthManager) return;
    const isNowRead = await window.AuthManager.toggleRead(secNum, chNum);
    const btn = document.getElementById(`btnBlogRead-${secNum}`);
    if (btn) {
      btn.textContent = isNowRead ? '✓ Read' : 'Mark as Read';
      btn.classList.toggle('is-read', isNowRead);
    }
    
    // Update count in header
    if (this.currentChapter) {
      let count = 0;
      this.currentChapter.sections.forEach(s => {
        if (window.AuthManager.isSectionRead(s.number)) count++;
      });
      const countEl = document.getElementById('blogReadCountText');
      if (countEl) countEl.textContent = count;
    }

    this.showToast(isNowRead ? `Section ${secNum} marked as read!` : `Section ${secNum} unmarked.`);
  },

  toggleBlogBookmark(secNum) {
    const section = this.findSection(secNum);
    if (!section) return;
    const isNow = window.BookmarksManager.toggleBookmark(section);
    const btn = document.getElementById(`btnBlogBookmark-${secNum}`);
    if (btn) {
      btn.innerHTML = isNow ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
      btn.classList.toggle('active', isNow);
    }
    this.showToast(isNow ? 'Saved to bookmarks' : 'Removed from bookmarks');
    if (window.AuthManager) window.AuthManager.syncOfflineData();
  },

  speakBlogPassage(element, secNum) {
    const text = element.innerText.replace('Play passage', '').trim();
    if (text) {
      const section = this.findSection(secNum);
      window.TTSEngine.speakSelectedPassage(text, section);
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
            <span class="speak-hint"><i class="fa-solid fa-play" style="font-size:0.65rem;"></i> Play passage</span>
          </div>
        `).join('')
      : `<div class="reader-paragraph" id="para-0">${this.escapeHtml(section.content)}</div>`;

    const html = `
      <div class="book-page-wrapper">
        <div class="page-running-head">
          <button class="btn-folio-nav" onclick="App.openChapterBlog(${section.chapterNumber})">
            <i class="fa-solid fa-arrow-left-long"></i> Chapter ${section.chapterNumber}
          </button>
          <div class="running-head-center">
            <span class="running-head-book">CONSTITUTION OF ZIMBABWE</span>
            <span class="running-head-chap">CHAPTER ${section.chapterNumber} • SECTION ${section.number}</span>
          </div>
          <div class="running-head-actions">
            <button class="btn-folio-tool ${isRead ? 'is-read' : ''}" id="btnMarkRead" onclick="App.toggleSectionRead()" title="Reading progress">
              ${isRead ? '<i class="fa-solid fa-check"></i> Read' : '<i class="fa-regular fa-circle-check"></i> Mark Read'}
            </button>
            <button class="btn-folio-tool" onclick="App.changeFontSize(-1)">A-</button>
            <button class="btn-folio-tool" onclick="App.changeFontSize(1)">A+</button>
            <button class="btn-folio-tool ${isBookmarked ? 'active' : ''}" id="btnBookmark" onclick="App.toggleBookmarkCurrent()" title="Dog-ear">
              ${isBookmarked ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>'}
            </button>
          </div>
        </div>

        <div class="chapter-opening-header" style="margin-bottom:2rem; padding-bottom:1.5rem;">
          <div class="chapter-opening-label">CHAPTER ${section.chapterNumber}: ${this.escapeHtml(section.chapterTitle)}</div>
          <h1 class="chapter-opening-title" style="font-size:2rem;">§ ${section.number}. ${this.escapeHtml(section.title)}</h1>
          <div class="chapter-opening-actions" style="margin-top:1rem;">
            <button class="btn-book-primary" onclick="App.quickPlaySection(${section.number})">
              <i class="fa-solid fa-headphones"></i> Listen to Clause
            </button>
          </div>
        </div>

        ${section.summary ? `
          <aside class="book-marginalia-note" style="max-width: 680px; margin: 0 auto 2rem;">
            <div class="marginalia-tag"><i class="fa-solid fa-feather-pointed"></i> Commentary & Plain-English Context</div>
            <p class="marginalia-text">${this.escapeHtml(section.summary)}</p>
          </aside>
        ` : ''}

        <!-- Section Legal Text -->
        <div class="book-sections-body" style="max-width: 680px; margin: 0 auto;">
          <div class="leaf-sec-body" id="readerBody">
            ${paragraphs.length > 0 
              ? paragraphs.map((p, idx) => `
                  <div class="reader-paragraph book-paragraph" id="para-${idx}" onclick="App.speakPassageFromElement(this, ${idx})">
                    ${this.formatParagraphText(p)}
                    <span class="speak-hint"><i class="fa-solid fa-headphones" style="font-size:0.65rem;"></i> Read passage</span>
                  </div>
                `).join('')
              : `<div class="reader-paragraph book-paragraph" id="para-0">${this.escapeHtml(section.content)}</div>`}
          </div>
        </div>

        <!-- Reader's Civic Study Notes -->
        <div style="max-width: 680px; margin: 2.5rem auto 0; padding: 1.25rem; background: var(--bg-surface); border-radius: 4px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
            <span style="font-family:var(--font-serif); font-size:0.92rem; font-weight:700; color:var(--gold);"><i class="fa-solid fa-pen-to-square"></i> Reader's Notes for § ${section.number}</span>
            <span id="noteSaveStatus" style="font-size:0.75rem; color:var(--text-dim); font-style:italic;"></span>
          </div>
          <textarea id="sectionNoteInput" 
            style="width:100%; height:75px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px; padding:0.65rem; font-family:var(--font-serif); font-size:0.92rem; outline:none; resize:vertical; line-height:1.6;" 
            placeholder="Add legal analysis, margin reflections, or court citations...">${this.escapeHtml(existingNote)}</textarea>
          <div style="margin-top:0.5rem; text-align:right;">
            <button class="btn-folio-tool" style="font-size:0.82rem; padding:0.4rem 0.9rem;" onclick="App.saveCurrentNote()">Save Note</button>
          </div>
        </div>

        <!-- Prev / Next Clause Navigation -->
        <div class="book-page-turn-footer">
          <div>
            ${section.number > 1 ? `
              <button class="btn-page-turn" onclick="App.openSection(${section.number - 1})">
                <i class="fa-solid fa-arrow-left-long"></i> § ${section.number - 1}
              </button>
            ` : '<span></span>'}
          </div>
          <button class="btn-page-turn btn-page-top" onclick="App.openChapterBlog(${section.chapterNumber})">
            <i class="fa-solid fa-book-open"></i> Full Chapter ${section.chapterNumber}
          </button>
          <div>
            ${section.number < 345 ? `
              <button class="btn-page-turn" onclick="App.openSection(${section.number + 1})">
                § ${section.number + 1} <i class="fa-solid fa-arrow-right-long"></i>
              </button>
            ` : '<span></span>'}
          </div>
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
      <div class="book-page-wrapper">
        <div class="page-running-head">
          <button class="btn-folio-nav" onclick="App.switchTab('chapters')">
            <i class="fa-solid fa-arrow-left-long"></i> Table of Contents
          </button>
          <div class="running-head-center">
            <span class="running-head-book">CONSTITUTION OF ZIMBABWE</span>
            <span class="running-head-chap">THE PREAMBLE</span>
          </div>
          <div class="running-head-actions">
            <button class="btn-folio-tool" onclick="App.changeFontSize(-1)">A-</button>
            <button class="btn-folio-tool" onclick="App.changeFontSize(1)">A+</button>
            <button class="btn-folio-tool" onclick="App.toggleSerif()">${this.useSerif ? 'Sans' : 'Serif'}</button>
          </div>
        </div>

        <div class="chapter-opening-header">
          <div class="chapter-opening-label">FOUNDING CHARTER</div>
          <h1 class="chapter-opening-title">Preamble</h1>
          <div class="chapter-opening-rule">
            <span class="ornament">❧</span>
          </div>
          <div class="chapter-opening-actions">
            <button class="btn-book-primary" onclick="App.quickPlayPreamble()">
              <i class="fa-solid fa-headphones"></i> Listen to Preamble
            </button>
          </div>
        </div>

        <aside class="book-marginalia-note" style="max-width: 680px; margin: 0 auto 2.5rem;">
          <div class="marginalia-tag"><i class="fa-solid fa-feather-pointed"></i> Proclamation Note</div>
          <p class="marginalia-text">The Preamble is the philosophical cornerstone of Zimbabwe's 2013 Constitution, declaring popular sovereignty, historical resistance to colonial domination, equality, and national reconciliation.</p>
        </aside>

        <div class="book-sections-body" style="max-width: 680px; margin: 0 auto;">
          <div class="leaf-sec-body">
            ${this.data.preamble.split('\n\n').map((para, idx) => `
              <div class="reader-paragraph book-paragraph" id="para-${idx}" onclick="App.speakPassageFromElement(this, ${idx})">
                ${this.escapeHtml(para)}
                <span class="speak-hint"><i class="fa-solid fa-headphones" style="font-size:0.65rem;"></i> Read passage</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="book-page-turn-footer">
          <div></div>
          <button class="btn-page-turn" onclick="App.openChapterBlog(1)">
            Chapter I: Founding Provisions <i class="fa-solid fa-arrow-right-long"></i>
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
      btn.innerHTML = isNow ? '<i class="fa-solid fa-bookmark"></i> Saved' : '<i class="fa-regular fa-bookmark"></i> Bookmark';
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
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size:2rem; margin-bottom:0.5rem; color:var(--text-muted);"><i class="fa-solid fa-magnifying-glass"></i></div>
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

    window.TTSEngine.onTrackChange = (section, chNumber, trackIndex, totalTracks) => {
      this.handleTrackChange(section, chNumber, trackIndex, totalTracks);
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

  handleTrackChange(section, chNumber, trackIndex, totalTracks) {
    this.currentSection = section;

    // Auto-update reading progress in AuthManager
    if (window.AuthManager && window.AuthManager.currentUser && section.number > 0) {
      window.AuthManager.markSectionRead(section.number);
      window.AuthManager.currentUser.last_section_number = section.number;
      window.AuthManager.saveUserToStorage();
    }

    // Synchronize highlight in Chapter Blog view
    this.syncBlogNowPlaying(section, chNumber);

    // Update active track row highlight in chapters list
    document.querySelectorAll('.track-row').forEach(c => c.classList.remove('is-playing'));
    const activeRow = document.getElementById(`trackRow-${chNumber}`);
    if (activeRow) activeRow.classList.add('is-playing');

    // Update mini bar album thumbnail
    const albumIcon = document.getElementById('miniAlbumIcon');
    if (albumIcon) {
      albumIcon.innerHTML = `<i class="fa-solid fa-volume-high fa-beat-fade"></i>`;
    }
  },

  syncBlogNowPlaying(section, chNumber) {
    // Remove previous now-playing highlights in reader
    document.querySelectorAll('.book-section-leaf, .reader-section-block').forEach(el => {
      el.classList.remove('is-now-playing');
      const badge = el.querySelector('.now-playing-pill, .now-narrating-ribbon');
      if (badge) badge.remove();
    });

    const secEl = document.getElementById(`blog-sec-${section.number}`);
    if (secEl) {
      secEl.classList.add('is-now-playing');
      const headerNum = secEl.querySelector('.leaf-sec-symbol, .reader-sec-num');
      if (headerNum && !secEl.querySelector('.now-narrating-ribbon')) {
        const badge = document.createElement('span');
        badge.className = 'now-narrating-ribbon';
        badge.innerHTML = `<i class="fa-solid fa-volume-high fa-beat-fade"></i> Reading Now`;
        headerNum.appendChild(badge);
      }

      // Smoothly scroll active section block into view if chapter-blog tab is visible
      const blogTab = document.getElementById('tab-chapter-blog');
      if (blogTab && blogTab.classList.contains('active')) {
        secEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  },

  goToNowPlayingSection() {
    const currentSec = window.TTSEngine.currentSection || this.currentSection;
    if (!currentSec) {
      this.switchTab('audio');
      return;
    }

    const chNum = currentSec.chapterNumber || 1;
    if (!this.currentChapter || this.currentChapter.number !== chNum) {
      this.openChapterBlog(chNum);
    } else {
      this.switchTab('chapter-blog');
    }

    setTimeout(() => {
      this.scrollToBlogSection(currentSec.number);
      this.syncBlogNowPlaying(currentSec, chNum);
    }, 120);
  },

  playChapterContinuous(chNumber, startSecNumber = null) {
    const ch = this.findChapter(chNumber);
    if (!ch) return;

    window.TTSEngine.playChapterPlaylist(chNumber, startSecNumber);
    const startNum = startSecNumber || (ch.sections[0] ? ch.sections[0].number : 1);
    this.showToast(`Playing Chapter ${chNumber} (Section ${startNum})`, 'info');

    const blogTab = document.getElementById('tab-chapter-blog');
    if (blogTab && blogTab.classList.contains('active')) {
      const targetSec = this.findSection(startNum);
      if (targetSec) this.syncBlogNowPlaying(targetSec, chNumber);
    }
  },

  toggleContinuousPlay() {
    window.TTSEngine.toggleContinuousPlay();
    const isContinuous = window.TTSEngine.continuousPlay;
    const btn = document.getElementById('miniAutoplayToggle');
    if (btn) {
      btn.innerHTML = isContinuous 
        ? '<i class="fa-solid fa-repeat"></i> <span>Autoplay ON</span>' 
        : '<i class="fa-solid fa-repeat"></i> <span>Autoplay OFF</span>';
      btn.classList.toggle('is-off', !isContinuous);
    }
    this.showToast(isContinuous ? 'Continuous Autoplay: ON' : 'Continuous Autoplay: OFF', 'info');
  },

  updateAudioUI(state) {
    const miniBar = document.getElementById('miniAudioBar');
    const miniTitle = document.getElementById('miniTrackTitle');
    const miniSub = document.getElementById('miniTrackSub');
    const miniBtnPlay = document.getElementById('miniBtnPlay');
    const miniToggle = document.getElementById('miniAutoplayToggle');
    const miniProgressFill = document.getElementById('miniProgressFill');

    const loungeTitle = document.getElementById('loungeTitle');
    const loungeTag = document.getElementById('loungeTag');
    const loungeBtnPlay = document.getElementById('loungeBtnPlay');

    if (miniToggle) {
      miniToggle.innerHTML = window.TTSEngine.continuousPlay 
        ? '<i class="fa-solid fa-repeat"></i> <span>Autoplay ON</span>' 
        : '<i class="fa-solid fa-repeat"></i> <span>Autoplay OFF</span>';
      miniToggle.classList.toggle('is-off', !window.TTSEngine.continuousPlay);
    }

    if (state.currentSection) {
      if (miniBar) miniBar.classList.add('active');
      const title = `Section ${state.currentSection.number}: ${state.currentSection.title}`;
      const sub = `Chapter ${state.currentSection.chapterNumber} • ${state.conversationalMode ? 'Conversational Explainer' : 'Verbatim'}`;

      if (miniTitle) miniTitle.textContent = title;
      if (miniSub) miniSub.textContent = sub;
      if (loungeTitle) loungeTitle.textContent = title;
      if (loungeTag) loungeTag.textContent = `Chapter ${state.currentSection.chapterNumber}`;
    }

    const icon = state.isPlaying && !state.isPaused ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    if (miniBtnPlay) miniBtnPlay.innerHTML = icon;
    if (loungeBtnPlay) loungeBtnPlay.innerHTML = icon;

    if (miniProgressFill && state.totalParagraphs > 0) {
      const pct = Math.round(((state.currentParagraphIndex + 1) / state.totalParagraphs) * 100);
      miniProgressFill.style.width = `${pct}%`;
    }
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
      this.playChapterContinuous(1);
    }
  },

  updateSpeedButtonLabel(rate) {
    const lbl = document.getElementById('speedValueLabel');
    if (!lbl) return;
    const r = parseFloat(rate || window.TTSEngine.rate || 1.0);
    let desc = 'Normal';
    if (r < 0.8) desc = 'Slower';
    else if (r < 1.0) desc = 'Relaxed';
    else if (r > 1.2) desc = 'Fast';
    else if (r > 1.0) desc = 'Brisk';
    lbl.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${r}x (${desc})`;
  },

  async openSpeedSelector() {
    const currentRate = (window.TTSEngine.rate || 1.0).toString();
    const inputOptions = {
      '0.75': '0.75x — Slower (Study pace)',
      '0.9':  '0.9x  — Relaxed pace',
      '1':    '1.0x  — Normal (Recommended)',
      '1.15': '1.15x — Conversational pace',
      '1.25': '1.25x — Brisk reading',
      '1.5':  '1.5x  — Fast recap'
    };

    const { value: selectedSpeed } = await Swal.fire({
      title: 'Speech Playback Speed',
      input: 'radio',
      inputOptions: inputOptions,
      inputValue: currentRate,
      confirmButtonText: 'Apply Speed',
      confirmButtonColor: '#2563eb',
      showCancelButton: true,
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#94a3b8'
    });

    if (selectedSpeed) {
      window.TTSEngine.setRate(selectedSpeed);
      this.updateSpeedButtonLabel(selectedSpeed);
      this.showToast(`Playback speed set to ${selectedSpeed}x`, 'success');
    }
  },

  updateVoiceButtonLabel() {
    const lbl = document.getElementById('voiceValueLabel');
    if (!lbl) return;

    if (window.TTSEngine.isElevenLabs) {
      lbl.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i> ElevenLabs AI Voice (HD)`;
    } else if (window.TTSEngine.selectedVoice) {
      const vName = window.TTSEngine.selectedVoice.name || 'Natural Device Voice';
      lbl.innerHTML = `<i class="fa-solid fa-microphone"></i> ${this.escapeHtml(vName)}`;
    } else {
      lbl.innerHTML = `<i class="fa-solid fa-microphone"></i> Natural Device Voice`;
    }
  },

  renderVoiceOptions() {
    this.updateVoiceButtonLabel();
  },

  async openVoiceSelector() {
    const isEleven = window.TTSEngine.isElevenLabs;
    const isPremium = window.AuthManager && window.AuthManager.currentUser && window.AuthManager.currentUser.is_premium;
    const voices = window.TTSEngine.voices || [];

    const inputOptions = {};
    inputOptions['elevenlabs'] = `ElevenLabs HD Neural AI Voice ${isPremium ? '(Active)' : '(Requires Premium)'}`;
    inputOptions['default'] = 'Natural Device Conversational Voice (Free & Offline)';

    voices.forEach(v => {
      inputOptions[v.voiceURI] = `${v.name} (${v.lang})`;
    });

    let currentValue = 'default';
    if (isEleven) {
      currentValue = 'elevenlabs';
    } else if (window.TTSEngine.selectedVoice) {
      currentValue = window.TTSEngine.selectedVoice.voiceURI;
    }

    const { value: selectedVoiceUri } = await Swal.fire({
      title: 'Speech Voice & Quality',
      input: 'select',
      inputOptions: inputOptions,
      inputValue: currentValue,
      confirmButtonText: 'Apply Voice',
      confirmButtonColor: '#2563eb',
      showCancelButton: true,
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#94a3b8'
    });

    if (!selectedVoiceUri) return;

    if (selectedVoiceUri === 'elevenlabs') {
      const user = window.AuthManager ? window.AuthManager.currentUser : null;
      if (!user) {
        const signinRes = await Swal.fire({
          icon: 'info',
          title: 'Sign In Required',
          text: 'Please sign in with your email account to activate ElevenLabs AI Voice.',
          confirmButtonText: 'Sign In Now',
          confirmButtonColor: '#2563eb',
          showCancelButton: true,
          cancelButtonText: 'Later',
          cancelButtonColor: '#94a3b8'
        });
        if (signinRes.isConfirmed) {
          this.openAuthModal('login');
        }
        window.TTSEngine.setVoice('');
        this.updateVoiceButtonLabel();
        return;
      }

      if (!user.is_premium) {
        const demoPrompt = await Swal.fire({
          icon: 'question',
          title: 'ElevenLabs HD Voice',
          text: 'ElevenLabs AI Voice is for Premium subscribers. Would you like to activate the Demo Premium Pass for your account to test it right now?',
          showCancelButton: true,
          confirmButtonText: 'Activate Demo Pass',
          confirmButtonColor: '#2563eb',
          cancelButtonText: 'Keep Free Voice',
          cancelButtonColor: '#94a3b8'
        });

        if (demoPrompt.isConfirmed) {
          await this.toggleDemoPremium();
          window.TTSEngine.setVoice('elevenlabs');
          this.updateVoiceButtonLabel();
          this.showToast('Demo Premium Pass active! ElevenLabs HD Voice enabled.', 'success');
        } else {
          window.TTSEngine.setVoice('');
          this.updateVoiceButtonLabel();
        }
        return;
      }

      window.TTSEngine.setVoice('elevenlabs');
      this.updateVoiceButtonLabel();
      this.showToast('ElevenLabs HD AI Voice enabled.', 'success');
    } else if (selectedVoiceUri === 'default') {
      window.TTSEngine.setVoice('');
      this.updateVoiceButtonLabel();
      this.showToast('Using Default Conversational Voice.', 'info');
    } else {
      window.TTSEngine.setVoice(selectedVoiceUri);
      this.updateVoiceButtonLabel();
      this.showToast('Device voice applied.', 'info');
    }
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
        <div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size:2rem; margin-bottom:0.75rem; color:var(--text-muted);"><i class="fa-regular fa-bookmark"></i></div>
          <p style="font-size:0.95rem;">No saved bookmarks yet. Tap the bookmark button on any section to save it here for quick reference.</p>
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
            <button class="btn-pill" onclick="event.stopPropagation(); App.removeBookmark(${b.number})" style="color:var(--crimson);"><i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i> Remove</button>
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
      this.showToast('Bookmark removed', 'info');
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

    const convCheckbox = document.getElementById('convModeCheckbox');
    if (convCheckbox) {
      convCheckbox.checked = window.TTSEngine.conversationalMode;
      convCheckbox.addEventListener('change', (e) => {
        window.TTSEngine.setConversationalMode(e.target.checked);
      });
    }
  },

  showToast(message, icon = 'info') {
    if (window.Swal) {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      });
      Toast.fire({
        icon: icon,
        title: message
      });
    } else {
      console.log(`[Toast] ${message}`);
    }
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
