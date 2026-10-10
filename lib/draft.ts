const key = (id: string) => `gb:draft:${id}`;

export const loadDraft = (id: string): string | null => {
  try { return localStorage.getItem(key(id)); } catch { return null; }
};

export const saveDraft = (id: string, code: string) => {
  try { localStorage.setItem(key(id), code); } catch { /* storage unavailable: drafts just won't persist */ }
};

export const clearDraft = (id: string) => {
  try { localStorage.removeItem(key(id)); } catch { /* same */ }
};