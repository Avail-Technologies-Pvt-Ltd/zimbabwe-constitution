/**
 * Instant Search Index for Zimbabwean Constitution
 * Fast token-based and regex search across all 345 sections with context snippets and highlights.
 */

const ConstitutionSearch = {
  data: null,
  index: [],

  init(constitutionData) {
    this.data = constitutionData;
    this.buildIndex();
  },

  buildIndex() {
    this.index = [];
    if (!this.data || !this.data.chapters) return;

    // Index Preamble
    if (this.data.preamble) {
      this.index.push({
        type: 'preamble',
        number: 0,
        title: 'Preamble',
        chapterNumber: 0,
        chapterTitle: 'Preamble',
        content: this.data.preamble,
        searchable: `preamble ${this.data.preamble}`.toLowerCase()
      });
    }

    // Index all Sections across all 18 Chapters
    this.data.chapters.forEach(ch => {
      ch.sections.forEach(sec => {
        this.index.push({
          type: 'section',
          number: sec.number,
          title: sec.title,
          chapterNumber: ch.number,
          chapterTitle: ch.title,
          summary: sec.summary || '',
          content: sec.content || '',
          searchable: `section ${sec.number} chapter ${ch.number} ${sec.title} ${sec.summary} ${sec.content}`.toLowerCase()
        });
      });
    });

    // Index Schedules
    if (this.data.schedules) {
      this.data.schedules.forEach((sch, idx) => {
        this.index.push({
          type: 'schedule',
          number: idx + 1,
          title: sch.name + ': ' + sch.title,
          chapterNumber: 99,
          chapterTitle: 'Schedules',
          content: sch.content || '',
          searchable: `${sch.name} ${sch.title} ${sch.content}`.toLowerCase()
        });
      });
    }

    console.log(`[Search] Built index with ${this.index.length} constitutional items.`);
  },

  search(query, chapterFilter = 'all') {
    if (!query || !query.trim()) {
      return [];
    }

    const rawTerms = query.trim().split(/\s+/).filter(t => t.length > 0);
    const lowerTerms = rawTerms.map(t => t.toLowerCase());

    // Check if query is a direct section number, e.g. "56" or "s56" or "section 56"
    const secNumMatch = query.match(/^(?:section\s+|s\s*)?(\d+)$/i);
    const targetSecNum = secNumMatch ? parseInt(secNumMatch[1], 10) : null;

    let filtered = this.index;
    if (chapterFilter !== 'all') {
      const chNum = parseInt(chapterFilter, 10);
      filtered = filtered.filter(item => item.chapterNumber === chNum);
    }

    const results = [];

    filtered.forEach(item => {
      let score = 0;

      // Exact section number boost
      if (targetSecNum !== null && item.type === 'section' && item.number === targetSecNum) {
        score += 200;
      }

      // Check title matches
      const titleLower = item.title.toLowerCase();
      lowerTerms.forEach(term => {
        if (titleLower === term) score += 50;
        else if (titleLower.includes(term)) score += 25;
      });

      // Check summary matches
      if (item.summary) {
        const sumLower = item.summary.toLowerCase();
        lowerTerms.forEach(term => {
          if (sumLower.includes(term)) score += 15;
        });
      }

      // Check content matches
      const contentLower = item.content.toLowerCase();
      let allTermsFound = true;

      lowerTerms.forEach(term => {
        if (contentLower.includes(term)) {
          score += 10;
        } else if (!titleLower.includes(term)) {
          allTermsFound = false;
        }
      });

      if (score > 0) {
        // Extract context snippet
        const snippet = this.generateSnippet(item.content, lowerTerms);
        results.push({
          item,
          score,
          snippet
        });
      }
    });

    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 50); // Top 50 results
  },

  generateSnippet(text, terms, maxLength = 180) {
    if (!text) return '';
    const lower = text.toLowerCase();
    let bestPos = -1;

    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx !== -1) {
        bestPos = idx;
        break;
      }
    }

    if (bestPos === -1) {
      return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, bestPos - 50);
    const end = Math.min(text.length, start + maxLength);
    let snippet = text.slice(start, end).trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  },

  highlight(text, terms) {
    if (!text || !terms || terms.length === 0) return text;
    let escapedTerms = terms
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(t => t.length > 0);
    if (!escapedTerms.length) return text;

    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    return text.replace(regex, '<mark class="highlight">$1</mark>');
  }
};

window.ConstitutionSearch = ConstitutionSearch;
