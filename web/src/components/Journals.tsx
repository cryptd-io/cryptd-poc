import { useState, useEffect } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Journals.css';

interface JournalEntry {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface Journal {
  id: string;
  title: string;
  entries: JournalEntry[];
  createdAt: number;
  updatedAt: number;
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
        const sorted = (data.journals || []).sort((a, b) => b.updatedAt - a.updatedAt);
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
    setEditingEntryId(null);
    setEditContent('');
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

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const entry: JournalEntry = {
        id: crypto.randomUUID(),
        content: newEntry,
        createdAt: now,
        updatedAt: now,
      };

      const updatedJournal = {
        ...selectedJournal,
        entries: [entry, ...selectedJournal.entries],
        updatedAt: now,
      };

      const updatedJournals = journals.map((j) =>
        j.id === selectedJournal.id ? updatedJournal : j
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveJournals(updatedJournals);
      setJournals(updatedJournals);
      setSelectedJournal(updatedJournal);
      setNewEntry('');
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
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!selectedJournal) return;
    if (!editContent.trim()) {
      setError('Entry content is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedEntries = selectedJournal.entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, content: editContent, updatedAt: now }
          : entry
      );

      const updatedJournal = {
        ...selectedJournal,
        entries: updatedEntries,
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
        entries: updatedEntries,
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

        // Sort imported journals
        const sorted = importData.journals.sort((a, b) => b.updatedAt - a.updatedAt);
        
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
              <button onClick={handleDeleteJournal} className="btn-delete-journal">
                Delete Journal
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {/* New Entry Form */}
            <div className="new-entry-card">
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
                      <div className="entry-date">{formatDate(entry.createdAt)}</div>
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
                      <textarea
                        className="entry-edit-input"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                      />
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
