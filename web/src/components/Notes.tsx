import { useState, useEffect } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Notes.css';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface NotesData {
  notes: Note[];
}

const BLOB_NAME = 'notes';

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Load notes on mount
  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setLoading(true);
    setError('');
    
    try {
      const authState = loadAuthState();
      if (!authState) throw new Error('Not authenticated');

      // Try to fetch existing notes blob
      try {
        const response = await getBlob(authState.token, BLOB_NAME);
        const decrypted = await decryptBlob(
          response.encryptedBlob,
          authState.accountKey,
          BLOB_NAME
        );
        
        const data: NotesData = JSON.parse(decrypted);
        setNotes(data.notes || []);
      } catch (err) {
        // Blob doesn't exist yet (404), start with empty notes
        const error = err as { status?: number };
        if (error.status === 404) {
          setNotes([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async (updatedNotes: Note[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: NotesData = { notes: updatedNotes };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  const handleCreateNote = () => {
    setIsEditing(true);
    setSelectedNote(null);
    setTitle('');
    setContent('');
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      let updatedNotes: Note[];

      if (selectedNote) {
        // Update existing note
        updatedNotes = notes.map((note) =>
          note.id === selectedNote.id
            ? { ...note, title, content, updatedAt: now }
            : note
        );
      } else {
        // Create new note
        const newNote: Note = {
          id: crypto.randomUUID(),
          title,
          content,
          createdAt: now,
          updatedAt: now,
        };
        updatedNotes = [newNote, ...notes];
      }

      await saveNotes(updatedNotes);
      setNotes(updatedNotes);
      
      // Select the saved note
      const savedNote = updatedNotes.find((n) => n.title === title && n.content === content);
      if (savedNote) {
        setSelectedNote(savedNote);
      }
      setIsEditing(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    if (!confirm('Delete this note?')) return;

    setSaving(true);
    setError('');

    try {
      const updatedNotes = notes.filter((note) => note.id !== selectedNote.id);
      await saveNotes(updatedNotes);
      setNotes(updatedNotes);
      setSelectedNote(null);
      setTitle('');
      setContent('');
      setIsEditing(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete note');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedNote) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      setIsEditing(false);
    } else {
      setTitle('');
      setContent('');
      setIsEditing(false);
    }
  };

  const handleExport = () => {
    try {
      const exportData: NotesData = { notes };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `notes-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export notes');
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
        const importData: NotesData = JSON.parse(text);
        
        if (!importData.notes || !Array.isArray(importData.notes)) {
          throw new Error('Invalid notes data format');
        }

        // Validate data structure
        for (const note of importData.notes) {
          if (!note.id || !note.title || note.content === undefined || 
              !note.createdAt || !note.updatedAt) {
            throw new Error('Invalid note format in import file');
          }
        }

        if (!confirm(`Import ${importData.notes.length} notes? This will replace all existing notes.`)) {
          return;
        }

        setSaving(true);
        setError('');

        // Save imported notes (overwrites existing data)
        await saveNotes(importData.notes);
        setNotes(importData.notes);
        setSelectedNote(null);
        setTitle('');
        setContent('');
        setIsEditing(false);

        alert(`Successfully imported ${importData.notes.length} notes!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import notes');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  if (loading) {
    return (
      <div className="notes-container">
        <div className="loading">Loading notes...</div>
      </div>
    );
  }

  return (
    <div className="notes-container">
      <div className="notes-sidebar">
        <div className="sidebar-header">
          <h2>Notes</h2>
          <button onClick={handleCreateNote} className="btn-new">
            + New
          </button>
        </div>
        
        <div className="sidebar-actions">
          <button onClick={handleExport} className="btn-export" title="Export notes">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import notes">
            📤 Import
          </button>
        </div>
        
        <div className="notes-list">
          {notes.length === 0 ? (
            <div className="empty-state">No notes yet. Create one!</div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={`note-item ${selectedNote?.id === note.id ? 'active' : ''}`}
                onClick={() => handleSelectNote(note)}
              >
                <div className="note-title">{note.title}</div>
                <div className="note-preview">
                  {note.content.substring(0, 60)}
                  {note.content.length > 60 ? '...' : ''}
                </div>
                <div className="note-date">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="notes-content">
        {selectedNote || isEditing ? (
          <>
            <div className="editor-header">
              {isEditing ? (
                <>
                  <button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancel} disabled={saving} className="btn-secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleEdit} className="btn-primary">
                    Edit
                  </button>
                  <button onClick={handleDelete} className="btn-danger">
                    Delete
                  </button>
                </>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            {isEditing ? (
              <div className="editor">
                <input
                  type="text"
                  className="title-input"
                  placeholder="Note title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  className="content-input"
                  placeholder="Write your note here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            ) : (
              <div className="viewer">
                <h1 className="view-title">{selectedNote?.title}</h1>
                <div className="view-content">{selectedNote?.content}</div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">📝</div>
            <h3>Select a note or create a new one</h3>
            <button onClick={handleCreateNote} className="btn-primary">
              Create Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
