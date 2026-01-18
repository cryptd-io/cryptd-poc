import { useState, useEffect } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Journals.css';

type SortField = 'createdAt' | 'updatedAt' | 'day';

interface JournalEntry {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  day?: string; // Format: YYYY-MM-DD - describes a specific day
}

interface Journal {
  id: string;
  title: string;
  entries: JournalEntry[];
  createdAt: number;
  updatedAt: number;
  dailyMode?: boolean; // Whether this journal is in daily mode (each entry describes a day)
  sortBy?: SortField; // Which field to sort entries by
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
  const [editCreatedAt, setEditCreatedAt] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isCreatingJournal, setIsCreatingJournal] = useState(false);
  const [newJournalTitle, setNewJournalTitle] = useState('');
  const [newEntryDay, setNewEntryDay] = useState('');
  const [editEntryDay, setEditEntryDay] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  // Load journals on mount
  useEffect(() => {
    loadJournals();
  }, []);

  const loadJournals = async () => {
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
        // Sort journals by updatedAt descending (most recently updated first)
        // Also sort entries within each journal by their configured sort field
        const sorted = (data.journals || [])
          .map(journal => ({
            ...journal,
            entries: sortEntries(journal.entries, journal.sortBy || 'createdAt')
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
  };

  const sortEntries = (entries: JournalEntry[], sortBy: SortField): JournalEntry[] => {
    return [...entries].sort((a, b) => {
      if (sortBy === 'day') {
        // For day, sort by date string (YYYY-MM-DD format sorts correctly)
        // Entries without day go to the end
        const dayA = a.day || '';
        const dayB = b.day || '';
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

  const handleSelectJournal = (journal: Journal) => {
    setSelectedJournal(journal);
    setNewEntry('');
    setNewEntryDay('');
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
      const updatedJournal = {
        ...selectedJournal,
        dailyMode: !selectedJournal.dailyMode,
        sortBy: (!selectedJournal.dailyMode ? 'day' : 'createdAt') as SortField,
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      );

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update journal settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeSortBy = async (newSortBy: SortField) => {
    if (!selectedJournal) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedJournal = {
        ...selectedJournal,
        sortBy: newSortBy,
        entries: sortEntries(selectedJournal.entries, newSortBy),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      );

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update sort order');
    } finally {
      setSaving(false);
    }
  };

  const validateDayUnique = (journal: Journal, day: string, excludeEntryId?: string): boolean => {
    return !journal.entries.some(
      entry => entry.day === day && entry.id !== excludeEntryId
    );
  };

  const validateJournal = () => {
    if (!selectedJournal) return;

    const issues: ValidationIssue[] = [];

    selectedJournal.entries.forEach((entry, index) => {
      const entryIssues: string[] = [];

      // Check required fields
      if (!entry.id) entryIssues.push('Missing ID');
      if (entry.content === undefined || entry.content === null) entryIssues.push('Missing content');
      if (entry.content && !entry.content.trim()) entryIssues.push('Content is empty');
      if (!entry.createdAt) entryIssues.push('Missing createdAt timestamp');
      if (!entry.updatedAt) entryIssues.push('Missing updatedAt timestamp');

      // Check day field
      if (selectedJournal.dailyMode) {
        // In daily mode, day field is required
        if (!entry.day) {
          entryIssues.push('Missing day field (required in daily mode)');
        } else {
          // Check date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(entry.day)) {
            entryIssues.push(`Invalid day format: "${entry.day}" (expected YYYY-MM-DD)`);
          }
        }
      } else {
        // In normal mode, day field is optional, but if present - validate format
        if (entry.day) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(entry.day)) {
            entryIssues.push(`Invalid day format: "${entry.day}" (expected YYYY-MM-DD)`);
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

    // Validate day if journal is in daily mode
    if (selectedJournal.dailyMode && newEntryDay) {
      if (!validateDayUnique(selectedJournal, newEntryDay)) {
        setError(`An entry for ${newEntryDay} already exists in this journal`);
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
        ...(selectedJournal.dailyMode && newEntryDay ? { day: newEntryDay } : {}),
      };

      const updatedJournal = {
        ...selectedJournal,
        entries: sortEntries([entry, ...selectedJournal.entries], selectedJournal.sortBy || 'createdAt'),
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      setNewEntry('');
      setNewEntryDay('');
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
    setEditCreatedAt(entry.createdAt);
    setEditEntryDay(entry.day || '');
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!selectedJournal) return;
    if (!editContent.trim()) {
      setError('Entry content is required');
      return;
    }

    // Validate day if journal is in daily mode
    if (selectedJournal.dailyMode && editEntryDay) {
      if (!validateDayUnique(selectedJournal, editEntryDay, entryId)) {
        setError(`An entry for ${editEntryDay} already exists in this journal`);
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
              createdAt: editCreatedAt,
              updatedAt: now,
              ...(selectedJournal.dailyMode && editEntryDay ? { day: editEntryDay } : {}),
            }
          : entry
      );

      const updatedJournal = {
        ...selectedJournal,
        entries: sortEntries(updatedEntries, selectedJournal.sortBy || 'createdAt'),
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
      setEditCreatedAt(0);
      setEditEntryDay('');
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
    setEditCreatedAt(0);
    setEditEntryDay('');
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
        entries: sortEntries(updatedEntries, selectedJournal.sortBy || 'createdAt'),
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

  const timestampToDateTimeLocal = (timestamp: number) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const dateTimeLocalToTimestamp = (dateTimeLocal: string) => {
    return new Date(dateTimeLocal).getTime();
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
            entries: sortEntries(journal.entries, journal.sortBy || 'createdAt')
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
              <h1>{selectedJournal.title}</h1>
              <div className="journal-header-actions">
                <button onClick={validateJournal} className="btn-validate" title="Validate journal entries">
                  ✓ Validate
                </button>
                <button onClick={handleDeleteJournal} className="btn-delete-journal">
                  Delete Journal
                </button>
              </div>
            </div>

            {/* Journal Settings */}
            <div className="journal-settings">
              <div className="setting-row">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={selectedJournal.dailyMode || false}
                    onChange={handleToggleDailyMode}
                    disabled={saving}
                  />
                  <span>Daily Mode</span>
                </label>
                <button
                  className="help-button"
                  title="In Daily Mode, each entry describes a specific day (identified by a date). The day field becomes required and entries can be sorted by day."
                >
                  ?
                </button>
              </div>
              
              <div className="setting-row">
                <label className="setting-label-text">Sort by:</label>
                <select
                  value={selectedJournal.sortBy || 'createdAt'}
                  onChange={(e) => handleChangeSortBy(e.target.value as SortField)}
                  disabled={saving}
                  className="sort-select"
                >
                  <option value="createdAt">Created Date</option>
                  <option value="updatedAt">Last Updated</option>
                  {selectedJournal.dailyMode && <option value="day">Day</option>}
                </select>
              </div>
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
                  <label htmlFor="new-entry-day">Day:</label>
                  <input
                    id="new-entry-day"
                    type="date"
                    value={newEntryDay}
                    onChange={(e) => setNewEntryDay(e.target.value)}
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
                        {selectedJournal.dailyMode && entry.day && (
                          <div className="entry-day">📅 {entry.day}</div>
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
                            <label htmlFor={`day-${entry.id}`}>Day:</label>
                            <input
                              id={`day-${entry.id}`}
                              type="date"
                              value={editEntryDay}
                              onChange={(e) => setEditEntryDay(e.target.value)}
                              className="date-input"
                            />
                          </div>
                        )}
                        <div className="entry-edit-date">
                          <label htmlFor={`date-${entry.id}`}>Created Date:</label>
                          <input
                            id={`date-${entry.id}`}
                            type="datetime-local"
                            value={timestampToDateTimeLocal(editCreatedAt)}
                            onChange={(e) => setEditCreatedAt(dateTimeLocalToTimestamp(e.target.value))}
                            className="entry-date-input"
                          />
                        </div>
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
