/**
 * Bookmarks and Notes Manager
 * Persists saved sections and user civic notes locally in localStorage.
 */

const BookmarksManager = {
  STORAGE_KEY: 'zim_constitution_bookmarks',
  NOTES_KEY: 'zim_constitution_notes',
  HISTORY_KEY: 'zim_constitution_history',

  getBookmarks() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to read bookmarks:', e);
      return [];
    }
  },

  isBookmarked(sectionNum) {
    const list = this.getBookmarks();
    return list.some(item => item.number === Number(sectionNum));
  },

  toggleBookmark(section) {
    let list = this.getBookmarks();
    const secNum = Number(section.number);
    const existingIndex = list.findIndex(item => item.number === secNum);

    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
      this.saveBookmarks(list);
      return false; // unbookmarked
    } else {
      list.unshift({
        number: secNum,
        title: section.title,
        chapterNumber: section.chapterNumber,
        chapterTitle: section.chapterTitle,
        addedAt: new Date().toISOString()
      });
      this.saveBookmarks(list);
      return true; // bookmarked
    }
  },

  saveBookmarks(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save bookmarks:', e);
    }
  },

  getNote(sectionNum) {
    try {
      const notes = JSON.parse(localStorage.getItem(this.NOTES_KEY) || '{}');
      return notes[sectionNum] || '';
    } catch (e) {
      return '';
    }
  },

  saveNote(sectionNum, noteText) {
    try {
      const notes = JSON.parse(localStorage.getItem(this.NOTES_KEY) || '{}');
      if (noteText.trim()) {
        notes[sectionNum] = noteText.trim();
      } else {
        delete notes[sectionNum];
      }
      localStorage.setItem(this.NOTES_KEY, JSON.stringify(notes));
    } catch (e) {
      console.warn('Failed to save note:', e);
    }
  },

  recordHistory(section) {
    try {
      let history = JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
      history = history.filter(h => h.number !== Number(section.number));
      history.unshift({
        number: Number(section.number),
        title: section.title,
        chapterNumber: section.chapterNumber,
        readAt: new Date().toISOString()
      });
      // Keep last 30
      if (history.length > 30) history = history.slice(0, 30);
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // Ignore
    }
  },

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
};

window.BookmarksManager = BookmarksManager;
