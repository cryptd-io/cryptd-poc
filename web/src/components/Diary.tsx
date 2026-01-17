import { useState, useEffect } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Diary.css';

interface DiaryEntry {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface DiaryData {
  entries: DiaryEntry[];
}

const BLOB_NAME = 'diary';

export default function Diary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    setError('');
    
    try {
      const authState = loadAuthState();
      if (!authState) throw new Error('Not authenticated');

      // Try to fetch existing diary blob
      try {
        const response = await getBlob(authState.token, BLOB_NAME);
        const decrypted = await decryptBlob(
          response.encryptedBlob,
          authState.accountKey,
          BLOB_NAME
        );
        
        const data: DiaryData = JSON.parse(decrypted);
        // Sort by createdAt descending (newest first)
        const sorted = (data.entries || []).sort((a, b) => b.createdAt - a.createdAt);
        setEntries(sorted);
      } catch (err) {
        // Blob doesn't exist yet (404), start with empty entries
        const error = err as { status?: number };
        if (error.status === 404) {
          setEntries([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load diary');
    } finally {
      setLoading(false);
    }
  };

  const saveEntries = async (updatedEntries: DiaryEntry[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: DiaryData = { entries: updatedEntries };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  const handleAddEntry = async () => {
    if (!newEntry.trim()) {
      setError('Entry content is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const entry: DiaryEntry = {
        id: crypto.randomUUID(),
        content: newEntry,
        createdAt: now,
        updatedAt: now,
      };

      const updatedEntries = [entry, ...entries];
      await saveEntries(updatedEntries);
      setEntries(updatedEntries);
      setNewEntry('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!editContent.trim()) {
      setError('Entry content is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const updatedEntries = entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, content: editContent, updatedAt: Date.now() }
          : entry
      );

      await saveEntries(updatedEntries);
      setEntries(updatedEntries);
      setEditingId(null);
      setEditContent('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update entry');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm('Delete this entry?')) return;

    setSaving(true);
    setError('');

    try {
      const updatedEntries = entries.filter((entry) => entry.id !== entryId);
      await saveEntries(updatedEntries);
      setEntries(updatedEntries);
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
      const exportData: DiaryData = { entries };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `diary-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export diary');
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
        const importData: DiaryData = JSON.parse(text);
        
        if (!importData.entries || !Array.isArray(importData.entries)) {
          throw new Error('Invalid diary data format');
        }

        // Validate data structure
        for (const entry of importData.entries) {
          if (!entry.id || entry.content === undefined || 
              !entry.createdAt || !entry.updatedAt) {
            throw new Error('Invalid entry format in import file');
          }
        }

        if (!confirm(`Import ${importData.entries.length} entries? This will replace all existing entries.`)) {
          return;
        }

        setSaving(true);
        setError('');

        // Sort imported entries
        const sorted = importData.entries.sort((a, b) => b.createdAt - a.createdAt);
        
        // Save imported entries (overwrites existing data)
        await saveEntries(sorted);
        setEntries(sorted);
        setEditingId(null);
        setEditContent('');

        alert(`Successfully imported ${sorted.length} entries!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import diary');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  if (loading) {
    return (
      <div className="diary-container">
        <div className="loading">Loading diary...</div>
      </div>
    );
  }

  return (
    <div className="diary-container">
      <div className="diary-content">
        <div className="diary-header">
          <h1>📖 My Diary</h1>
          <p className="diary-subtitle">Your personal encrypted journal</p>
        </div>

        <div className="diary-actions">
          <button onClick={handleExport} className="btn-export" title="Export diary">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import diary">
            📤 Import
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* New Entry Form */}
        <div className="new-entry-card">
          <textarea
            className="new-entry-input"
            placeholder="What's on your mind today?"
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
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✍️</div>
              <h3>No entries yet</h3>
              <p>Start writing your first diary entry above!</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="entry-card">
                <div className="entry-header">
                  <div className="entry-date">{formatDate(entry.createdAt)}</div>
                  <div className="entry-actions">
                    {editingId === entry.id ? (
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
                          onClick={() => handleDelete(entry.id)}
                          className="btn-delete"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === entry.id ? (
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
      </div>
    </div>
  );
}
