/**
 * Authentication and User Progress Manager
 * Handles login by email, registration, offline progress sync, and session caching.
 */

const AuthManager = {
  currentUser: null,
  readSections: new Set(),
  onAuthChange: null,

  init() {
    // Load cached offline progress first
    this.loadOfflineProgress();

    // Check with backend for active session
    this.checkStatus();
  },

  loadOfflineProgress() {
    try {
      const cached = localStorage.getItem('zim_user_progress');
      if (cached) {
        const list = JSON.parse(cached);
        this.readSections = new Set(list);
      }
      const userCached = localStorage.getItem('zim_current_user');
      if (userCached) {
        this.currentUser = JSON.parse(userCached);
      }
    } catch (e) {}
  },

  saveOfflineProgress() {
    try {
      localStorage.setItem('zim_user_progress', JSON.stringify(Array.from(this.readSections)));
      if (this.currentUser) {
        localStorage.setItem('zim_current_user', JSON.stringify(this.currentUser));
      } else {
        localStorage.removeItem('zim_current_user');
      }
    } catch (e) {}
  },

  isSectionRead(secNum) {
    return this.readSections.has(Number(secNum));
  },

  getTotalRead() {
    return this.readSections.size;
  },

  getPercentage() {
    return Math.round((this.getTotalRead() / 345) * 1000) / 10;
  },

  async checkStatus() {
    try {
      const res = await fetch('/api/auth/user/');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          this.handleAuthSuccess(data.user);
        } else {
          this.currentUser = null;
          this.saveOfflineProgress();
          if (this.onAuthChange) this.onAuthChange(null);
        }
      }
    } catch (e) {
      // Offline: keep cached user progress
      if (this.onAuthChange) this.onAuthChange(this.currentUser);
    }
  },

  async login(email, password) {
    const res = await fetch('/api/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': this.getCSRFToken()
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to login');
    }

    this.handleAuthSuccess(data.user);
    // Sync offline progress
    this.syncOfflineData();
    return data.user;
  },

  async register(email, password, name) {
    const res = await fetch('/api/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': this.getCSRFToken()
      },
      body: JSON.stringify({ email, password, name })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create account');
    }

    this.handleAuthSuccess(data.user);
    this.syncOfflineData();
    return data.user;
  },

  async logout() {
    try {
      await fetch('/api/auth/logout/', {
        method: 'POST',
        headers: {
          'X-CSRFToken': this.getCSRFToken()
        }
      });
    } catch (e) {}

    this.currentUser = null;
    this.saveOfflineProgress();
    if (this.onAuthChange) this.onAuthChange(null);
  },

  handleAuthSuccess(user) {
    this.currentUser = user;
    if (user.read_sections && Array.isArray(user.read_sections)) {
      user.read_sections.forEach(num => this.readSections.add(Number(num)));
    }
    this.saveOfflineProgress();
    if (this.onAuthChange) this.onAuthChange(user);
  },

  async toggleRead(sectionNumber, chapterNumber) {
    const secNum = Number(sectionNumber);
    const willBeRead = !this.readSections.has(secNum);

    if (willBeRead) {
      this.readSections.add(secNum);
    } else {
      this.readSections.delete(secNum);
    }
    this.saveOfflineProgress();

    // Notify UI immediately
    if (this.onAuthChange) this.onAuthChange(this.currentUser);

    // If online, sync to database
    if (this.currentUser && navigator.onLine) {
      try {
        await fetch('/api/progress/toggle/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCSRFToken()
          },
          body: JSON.stringify({
            section_number: secNum,
            chapter_number: chapterNumber,
            is_read: willBeRead
          })
        });
      } catch (e) {
        console.warn('Progress queued offline:', e);
      }
    }

    return willBeRead;
  },

  async syncOfflineData() {
    if (!this.currentUser || !navigator.onLine) return;

    try {
      const readArray = Array.from(this.readSections);
      const bookmarks = window.BookmarksManager.getBookmarks();

      const res = await fetch('/api/progress/sync/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken()
        },
        body: JSON.stringify({
          read_sections: readArray,
          bookmarks: bookmarks
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.handleAuthSuccess(data.user);
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    }
  },

  getCSRFToken() {
    const match = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
    return match ? match[2] : '';
  }
};

window.AuthManager = AuthManager;
