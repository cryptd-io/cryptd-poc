import { useState, useEffect, useCallback } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Journals.css';

type SortField = 'createdAt' | 'updatedAt' | 'describedDay';

interface JournalEntry {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  describedDay?: string; // Format: YYYY-MM-DD - describes a specific day
}

interface Journal {
  id: string;
  title: string;
  entries: JournalEntry[];
  createdAt: number;
  updatedAt: number;
  dailyMode?: boolean; // Whether this journal is in daily mode (each entry describes a day)
}

interface ValidationIssue {
  entryId: string;
  entryIndex: number;
  issues: string[];
}

interface JournalsData {
  journals: Journal[];
}

const BLOB_NAME = 'journals';

export default function Journals() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [newEntry, setNewEntry] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isCreatingJournal, setIsCreatingJournal] = useState(false);
  const [newJournalTitle, setNewJournalTitle] = useState('');
  const [newEntryDescribedDay, setNewEntryDescribedDay] = useState('');
  const [editEntryDescribedDay, setEditEntryDescribedDay] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isRenamingJournal, setIsRenamingJournal] = useState(false);
  const [renameJournalTitle, setRenameJournalTitle] = useState('');

  const sortEntries = (entries: JournalEntry[], sortBy: SortField): JournalEntry[] => {
    return [...entries].sort((a, b) => {
      if (sortBy === 'describedDay') {
        // For describedDay, sort by date string (YYYY-MM-DD format sorts correctly)
        // Entries without describedDay go to the end
        const dayA = a.describedDay || '';
        const dayB = b.describedDay || '';
        if (!dayA && !dayB) return b.createdAt - a.createdAt;
        if (!dayA) return 1;
        if (!dayB) return -1;
        return dayB.localeCompare(dayA); // Descending order
      } else {
        // For createdAt and updatedAt, sort numerically descending
        return b[sortBy] - a[sortBy];
      }
    });
  };

  const getSortField = (journal: Journal): SortField => {
    // Auto-determine sort field based on mode
    return journal.dailyMode ? 'describedDay' : 'createdAt';
  };

  const cleanJournal = (journal: Journal): Journal => {
    const allowedJournalFields = ['id', 'title', 'entries', 'createdAt', 'updatedAt', 'dailyMode'];
    const allowedEntryFields = ['id', 'content', 'createdAt', 'updatedAt', 'describedDay'];
    
    // Clean journal fields
    const cleanedJournal: Record<string, unknown> = {};
    for (const key of allowedJournalFields) {
      if (key in journal) {
        cleanedJournal[key] = (journal as unknown as Record<string, unknown>)[key];
      }
    }
    
    // Clean entry fields
    if (Array.isArray(cleanedJournal.entries)) {
      cleanedJournal.entries = cleanedJournal.entries.map((entry: Record<string, unknown>) => {
        const cleanedEntry: Record<string, unknown> = {};
        for (const key of allowedEntryFields) {
          if (key in entry) {
            cleanedEntry[key] = entry[key];
          }
        }
        return cleanedEntry;
      });
    }
    
    return cleanedJournal as unknown as Journal;
  };

  const loadJournals = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const authState = loadAuthState();
      if (!authState) throw new Error('Not authenticated');

      // Try to fetch existing journals blob
      try {
        const response = await getBlob(authState.token, BLOB_NAME);
        const decrypted = await decryptBlob(
          response.encryptedBlob,
          authState.accountKey,
          BLOB_NAME
        );
        
        const data: JournalsData = JSON.parse(decrypted);
        // Clean up unknown fields and sort journals by updatedAt descending (most recently updated first)
        // Also sort entries within each journal by their configured sort field
        const sorted = (data.journals || [])
          .map(journal => cleanJournal(journal))
          .map(journal => ({
            ...journal,
            entries: sortEntries(journal.entries, getSortField(journal))
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        setJournals(sorted);
      } catch (err) {
        // Blob doesn't exist yet (404), start with empty journals
        const error = err as { status?: number };
        if (error.status === 404) {
          setJournals([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load journals');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load journals on mount
  useEffect(() => {
    loadJournals();
  }, [loadJournals]);

  const saveJournals = async (updatedJournals: Journal[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: JournalsData = { journals: updatedJournals };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  const handleCreateJournal = () => {
    setIsCreatingJournal(true);
    setNewJournalTitle('');
  };

  const handleSaveNewJournal = async () => {
    if (!newJournalTitle.trim()) {
      setError('Journal title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newJournal: Journal = {
        id: crypto.randomUUID(),
        title: newJournalTitle,
        entries: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedJournals = [newJournal, ...journals];
      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(newJournal);
      setIsCreatingJournal(false);
      setNewJournalTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create journal');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewJournal = () => {
    setIsCreatingJournal(false);
    setNewJournalTitle('');
  };

  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSelectJournal = (journal: Journal) => {
    setSelectedJournal(journal);
    setNewEntry('');
    // Auto-fill today's date if journal is in daily mode
    setNewEntryDescribedDay(journal.dailyMode ? getTodayDate() : '');
    setEditingEntryId(null);
    setEditContent('');
    setShowValidation(false);
    setValidationIssues([]);
  };

  const handleToggleDailyMode = async () => {
    if (!selectedJournal) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newDailyMode = !selectedJournal.dailyMode;
      const updatedJournal = {
        ...selectedJournal,
        dailyMode: newDailyMode,
        entries: sortEntries(selectedJournal.entries, newDailyMode ? 'describedDay' : 'createdAt'),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      );

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      
      // Auto-fill today's date when enabling daily mode
      if (newDailyMode) {
        setNewEntryDescribedDay(getTodayDate());
      } else {
        setNewEntryDescribedDay('');
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update journal settings');
    } finally {
      setSaving(false);
    }
  };

  const validateDescribedDayUnique = (journal: Journal, describedDay: string, excludeEntryId?: string): boolean => {
    return !journal.entries.some(
      entry => entry.describedDay === describedDay && entry.id !== excludeEntryId
    );
  };

  const validateJournal = () => {
    if (!selectedJournal) return;

    const issues: ValidationIssue[] = [];
    const allowedFields = ['id', 'content', 'createdAt', 'updatedAt', 'describedDay'];

    selectedJournal.entries.forEach((entry, index) => {
      const entryIssues: string[] = [];

      // Check for extra fields
      const entryKeys = Object.keys(entry);
      const extraFields = entryKeys.filter(key => !allowedFields.includes(key));
      if (extraFields.length > 0) {
        entryIssues.push(`Extra fields found: ${extraFields.join(', ')}`);
      }

      // Check required fields
      if (!entry.id) entryIssues.push('Missing ID');
      if (entry.content === undefined || entry.content === null) entryIssues.push('Missing content');
      if (entry.content && !entry.content.trim()) entryIssues.push('Content is empty');
      if (!entry.createdAt) entryIssues.push('Missing createdAt timestamp');
      if (!entry.updatedAt) entryIssues.push('Missing updatedAt timestamp');

      // Check describedDay field
      if (selectedJournal.dailyMode) {
        // In daily mode, describedDay field is required
        if (!entry.describedDay) {
          entryIssues.push('Missing describedDay field (required in daily mode)');
        } else {
          // Check date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(entry.describedDay)) {
            entryIssues.push(`Invalid describedDay format: "${entry.describedDay}" (expected YYYY-MM-DD)`);
          }
        }
      } else {
        // In normal mode, describedDay field is optional, but if present - validate format
        if (entry.describedDay) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(entry.describedDay)) {
            entryIssues.push(`Invalid describedDay format: "${entry.describedDay}" (expected YYYY-MM-DD)`);
          }
        }
      }

      if (entryIssues.length > 0) {
        issues.push({
          entryId: entry.id || `unknown-${index}`,
          entryIndex: index,
          issues: entryIssues,
        });
      }
    });

    setValidationIssues(issues);
    setShowValidation(true);

    if (issues.length === 0) {
      alert('✅ All entries are valid! No issues found.');
    }
  };

  const handleStartRenameJournal = () => {
    if (!selectedJournal) return;
    setIsRenamingJournal(true);
    setRenameJournalTitle(selectedJournal.title);
  };

  const handleSaveRenameJournal = async () => {
    if (!selectedJournal) return;
    if (!renameJournalTitle.trim()) {
      setError('Journal title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedJournal = {
        ...selectedJournal,
        title: renameJournalTitle,
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      setIsRenamingJournal(false);
      setRenameJournalTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to rename journal');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRenameJournal = () => {
    setIsRenamingJournal(false);
    setRenameJournalTitle('');
  };

  const handleDeleteJournal = async () => {
    if (!selectedJournal) return;
    if (!confirm(`Delete journal "${selectedJournal.title}"? This will delete all entries.`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedJournals = journals.filter((j) => j.id !== selectedJournal.id);
      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete journal');
    } finally {
      setSaving(false);
    }
  };

  const handleAddEntry = async () => {
    if (!selectedJournal) return;
    if (!newEntry.trim()) {
      setError('Entry content is required');
      return;
    }

    // Validate describedDay if journal is in daily mode
    if (selectedJournal.dailyMode && newEntryDescribedDay) {
      if (!validateDescribedDayUnique(selectedJournal, newEntryDescribedDay)) {
        setError(`An entry for ${newEntryDescribedDay} already exists in this journal`);
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const entry: JournalEntry = {
        id: crypto.randomUUID(),
        content: newEntry,
        createdAt: now,
        updatedAt: now,
        ...(selectedJournal.dailyMode && newEntryDescribedDay ? { describedDay: newEntryDescribedDay } : {}),
      };

      const updatedJournal = {
        ...selectedJournal,
        entries: sortEntries([entry, ...selectedJournal.entries], getSortField(selectedJournal)),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      setNewEntry('');
      // Keep today's date in daily mode, clear otherwise
      setNewEntryDescribedDay(selectedJournal.dailyMode ? getTodayDate() : '');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (entry: JournalEntry) => {
    setEditingEntryId(entry.id);
    setEditContent(entry.content);
    setEditEntryDescribedDay(entry.describedDay || '');
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!selectedJournal) return;
    if (!editContent.trim()) {
      setError('Entry content is required');
      return;
    }

    // Validate describedDay if journal is in daily mode
    if (selectedJournal.dailyMode && editEntryDescribedDay) {
      if (!validateDescribedDayUnique(selectedJournal, editEntryDescribedDay, entryId)) {
        setError(`An entry for ${editEntryDescribedDay} already exists in this journal`);
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedEntries = selectedJournal.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              content: editContent,
              updatedAt: now,
              ...(selectedJournal.dailyMode && editEntryDescribedDay ? { describedDay: editEntryDescribedDay } : {}),
            }
          : entry
      );

      const updatedJournal = {
        ...selectedJournal,
        entries: sortEntries(updatedEntries, getSortField(selectedJournal)),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      setEditingEntryId(null);
      setEditContent('');
      setEditEntryDescribedDay('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update entry');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
    setEditContent('');
    setEditEntryDescribedDay('');
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!selectedJournal) return;
    if (!confirm('Delete this entry?')) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedEntries = selectedJournal.entries.filter((entry) => entry.id !== entryId);

      const updatedJournal = {
        ...selectedJournal,
        entries: sortEntries(updatedEntries, getSortField(selectedJournal)),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete entry');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleExport = () => {
    try {
      const exportData: JournalsData = { journals };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `journals-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export journals');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData: JournalsData = JSON.parse(text);
        
        if (!importData.journals || !Array.isArray(importData.journals)) {
          throw new Error('Invalid journals data format');
        }

        // Validate data structure
        for (const journal of importData.journals) {
          if (!journal.id || !journal.title || !journal.entries ||
              !Array.isArray(journal.entries) || !journal.createdAt || !journal.updatedAt) {
            throw new Error('Invalid journal format in import file');
          }
          for (const entry of journal.entries) {
            if (!entry.id || entry.content === undefined || 
                !entry.createdAt || !entry.updatedAt) {
              throw new Error('Invalid entry format in import file');
            }
          }
        }

        if (!confirm(`Import ${importData.journals.length} journals? This will replace all existing journals.`)) {
          return;
        }

        setSaving(true);
        setError('');

        // Sort imported journals and their entries
        const sorted = importData.journals
          .map(journal => ({
            ...journal,
            entries: sortEntries(journal.entries, getSortField(journal))
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        
        // Save imported journals (overwrites existing data)
        await saveJournals(sorted);
        setJournals(sorted);
        setSelectedJournal(null);
        setNewEntry('');
        setEditingEntryId(null);
        setEditContent('');

        alert(`Successfully imported ${sorted.length} journals!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import journals');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  if (loading) {
    return (
      <div className="journals-container">
        <div className="loading">Loading journals...</div>
      </div>
    );
  }

  return (
    <div className="journals-container">
      <div className="journals-sidebar">
        <div className="sidebar-header">
          <h2>Journals</h2>
          <button onClick={handleCreateJournal} className="btn-new">
            + New
          </button>
        </div>
        
        <div className="sidebar-actions">
          <button onClick={handleExport} className="btn-export" title="Export journals">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import journals">
            📤 Import
          </button>
        </div>

        {isCreatingJournal && (
          <div className="new-journal-form">
            <input
              type="text"
              className="journal-title-input"
              placeholder="Journal title..."
              value={newJournalTitle}
              onChange={(e) => setNewJournalTitle(e.target.value)}
              autoFocus
            />
            <div className="form-actions">
              <button
                onClick={handleSaveNewJournal}
                disabled={saving}
                className="btn-save-small"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={handleCancelNewJournal}
                disabled={saving}
                className="btn-cancel-small"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="journals-list">
          {journals.length === 0 ? (
            <div className="empty-state">No journals yet. Create one!</div>
          ) : (
            journals.map((journal) => (
              <div
                key={journal.id}
                className={`journal-item ${selectedJournal?.id === journal.id ? 'active' : ''}`}
                onClick={() => handleSelectJournal(journal)}
              >
                <div className="journal-title">{journal.title}</div>
                <div className="journal-info">
                  <span className="journal-count">
                    {journal.entries.length} {journal.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                  <span className="journal-date">
                    {new Date(journal.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="journal-content">
        {selectedJournal ? (
          <>
            <div className="journal-header">
              {isRenamingJournal ? (
                <div className="rename-journal-form">
                  <input
                    type="text"
                    className="rename-journal-input"
                    placeholder="Journal title..."
                    value={renameJournalTitle}
                    onChange={(e) => setRenameJournalTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="rename-actions">
                    <button
                      onClick={handleSaveRenameJournal}
                      disabled={saving}
                      className="btn-save-rename"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelRenameJournal}
                      disabled={saving}
                      className="btn-cancel-rename"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1>{selectedJournal.title}</h1>
                  <div className="journal-header-actions">
                    <label className="daily-mode-toggle">
                      <input
                        type="checkbox"
                        checked={selectedJournal.dailyMode || false}
                        onChange={handleToggleDailyMode}
                        disabled={saving}
                      />
                      <span>Daily Mode</span>
                      <button
                        className="help-button"
                        title="In Daily Mode, each entry describes a specific day (identified by a date). The describedDay field becomes required and entries are sorted by day."
                        onClick={(e) => e.preventDefault()}
                      >
                        ?
                      </button>
                    </label>
                    <button onClick={handleStartRenameJournal} className="btn-rename-journal">
                      ✏️ Rename
                    </button>
                    <button onClick={validateJournal} className="btn-validate" title="Validate journal entries">
                      ✓ Validate
                    </button>
                    <button onClick={handleDeleteJournal} className="btn-delete-journal">
                      Delete Journal
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Validation Results */}
            {showValidation && validationIssues.length > 0 && (
              <div className="validation-panel">
                <div className="validation-header">
                  <h3>⚠️ Validation Issues ({validationIssues.length})</h3>
                  <button onClick={() => setShowValidation(false)} className="btn-close-validation">
                    ✕
                  </button>
                </div>
                <div className="validation-list">
                  {validationIssues.map((issue) => (
                    <div key={issue.entryId} className="validation-issue">
                      <div className="validation-issue-header">
                        Entry #{issue.entryIndex + 1} (ID: {issue.entryId})
                      </div>
                      <ul className="validation-issue-list">
                        {issue.issues.map((issueText, idx) => (
                          <li key={idx}>{issueText}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            {/* New Entry Form */}
            <div className="new-entry-card">
              {selectedJournal.dailyMode && (
                <div className="entry-date-input-row">
                  <label htmlFor="new-entry-described-day">Described Day:</label>
                  <input
                    id="new-entry-described-day"
                    type="date"
                    value={newEntryDescribedDay}
                    onChange={(e) => setNewEntryDescribedDay(e.target.value)}
                    className="date-input"
                  />
                </div>
              )}
              <textarea
                className="new-entry-input"
                placeholder="Write your journal entry..."
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                rows={4}
              />
              <div className="new-entry-actions">
                <button
                  onClick={handleAddEntry}
                  disabled={saving || !newEntry.trim()}
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
            </div>

            {/* Entries Feed */}
            <div className="entries-feed">
              {selectedJournal.entries.length === 0 ? (
                <div className="empty-state-entries">
                  <div className="empty-icon">✍️</div>
                  <h3>No entries yet</h3>
                  <p>Start writing your first entry above!</p>
                </div>
              ) : (
                selectedJournal.entries.map((entry) => (
                  <div key={entry.id} className="entry-card">
                    <div className="entry-header">
                      <div className="entry-date-info">
                        {selectedJournal.dailyMode && entry.describedDay && (
                          <div className="entry-described-day">📅 {entry.describedDay}</div>
                        )}
                        <div className="entry-date">{formatDate(entry.createdAt)}</div>
                      </div>
                      <div className="entry-actions">
                        {editingEntryId === entry.id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(entry.id)}
                              disabled={saving}
                              className="btn-save"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              className="btn-cancel"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(entry)}
                              className="btn-edit"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="btn-delete"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editingEntryId === entry.id ? (
                      <>
                        {selectedJournal.dailyMode && (
                          <div className="entry-edit-date">
                            <label htmlFor={`described-day-${entry.id}`}>Described Day:</label>
                            <input
                              id={`described-day-${entry.id}`}
                              type="date"
                              value={editEntryDescribedDay}
                              onChange={(e) => setEditEntryDescribedDay(e.target.value)}
                              className="date-input"
                            />
                          </div>
                        )}
                        <textarea
                          className="entry-edit-input"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={6}
                        />
                      </>
                    ) : (
                      <div className="entry-content">{entry.content}</div>
                    )}

                    <div className="entry-footer">
                      <div className="entry-timestamp">
                        {formatDateTime(entry.createdAt)}
                        {entry.updatedAt !== entry.createdAt && (
                          <span className="edited-label"> (edited)</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">📔</div>
            <h3>Select a journal or create a new one</h3>
            <button onClick={handleCreateJournal} className="btn-primary">
              Create Journal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
