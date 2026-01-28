import { useState, useEffect, useCallback } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Notes.css';

type Note = {
  id: string;
  title: string;
  content: string; // v1: plaintext/markdown
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
};

type NotesFolder = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  notes: Note[];
};

type NotesData = {
  folders: NotesFolder[];
};

const BLOB_NAME = 'notes';

export default function Notes() {
  const [folders, setFolders] = useState<NotesFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<NotesFolder | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Folder management
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renameFolderTitle, setRenameFolderTitle] = useState('');
  
  // Note editing
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  
  // View filters
  const [showArchived, setShowArchived] = useState(false);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const authState = loadAuthState();
      if (!authState) throw new Error('Not authenticated');

      try {
        const response = await getBlob(authState.token, BLOB_NAME);
        const decrypted = await decryptBlob(
          response.encryptedBlob,
          authState.accountKey,
          BLOB_NAME
        );
        
        const data: NotesData = JSON.parse(decrypted);
        const sorted = (data.folders || []).sort((a, b) => b.updatedAt - a.updatedAt);
        setFolders(sorted);
      } catch (err) {
        const error = err as { status?: number };
        if (error.status === 404) {
          setFolders([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const saveFolders = async (updatedFolders: NotesFolder[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: NotesData = { folders: updatedFolders };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  // Folder operations
  const handleCreateFolder = () => {
    setIsCreatingFolder(true);
    setNewFolderTitle('');
  };

  const handleSaveNewFolder = async () => {
    if (!newFolderTitle.trim()) {
      setError('Folder title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newFolder: NotesFolder = {
        id: crypto.randomUUID(),
        title: newFolderTitle,
        notes: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedFolders = [newFolder, ...folders];
      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(newFolder);
      setIsCreatingFolder(false);
      setNewFolderTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create folder');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewFolder = () => {
    setIsCreatingFolder(false);
    setNewFolderTitle('');
  };

  const handleSelectFolder = (folder: NotesFolder) => {
    setSelectedFolder(folder);
    setSelectedNote(null);
    setIsEditing(false);
  };

  const handleStartRenameFolder = () => {
    if (!selectedFolder) return;
    setIsRenamingFolder(true);
    setRenameFolderTitle(selectedFolder.title);
  };

  const handleSaveRenameFolder = async () => {
    if (!selectedFolder) return;
    if (!renameFolderTitle.trim()) {
      setError('Folder title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedFolder = {
        ...selectedFolder,
        title: renameFolderTitle,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
      setIsRenamingFolder(false);
      setRenameFolderTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to rename folder');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRenameFolder = () => {
    setIsRenamingFolder(false);
    setRenameFolderTitle('');
  };

  const handleToggleArchiveFolder = async () => {
    if (!selectedFolder) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedFolder = {
        ...selectedFolder,
        archived: !selectedFolder.archived,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive folder');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!selectedFolder) return;
    if (!confirm(`Delete folder "${selectedFolder.title}"? This will delete all notes inside.`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedFolders = folders.filter((f) => f.id !== selectedFolder.id);
      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(null);
      setSelectedNote(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete folder');
    } finally {
      setSaving(false);
    }
  };

  // Note operations
  const handleCreateNote = () => {
    if (!selectedFolder) return;
    setIsEditing(true);
    setSelectedNote(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveNote = async () => {
    if (!selectedFolder) return;
    if (!editTitle.trim()) {
      setError('Note title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      let updatedNotes: Note[];

      if (selectedNote) {
        // Update existing note
        updatedNotes = selectedFolder.notes.map((note) =>
          note.id === selectedNote.id
            ? { ...note, title: editTitle, content: editContent, updatedAt: now }
            : note
        );
      } else {
        // Create new note
        const newNote: Note = {
          id: crypto.randomUUID(),
          title: editTitle,
          content: editContent,
          createdAt: now,
          updatedAt: now,
        };
        updatedNotes = [newNote, ...selectedFolder.notes];
      }

      const updatedFolder = {
        ...selectedFolder,
        notes: updatedNotes,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
      
      // Select the saved note
      const savedNote = updatedNotes.find((n) => n.title === editTitle && n.content === editContent);
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

  const handleCancelEdit = () => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content);
      setIsEditing(false);
    } else {
      setEditTitle('');
      setEditContent('');
      setIsEditing(false);
    }
  };

  const handleTogglePinNote = async () => {
    if (!selectedFolder || !selectedNote) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedNotes = selectedFolder.notes.map((note) =>
        note.id === selectedNote.id
          ? { ...note, pinned: !note.pinned, updatedAt: now }
          : note
      );

      const updatedFolder = {
        ...selectedFolder,
        notes: updatedNotes,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
      
      const updatedNote = updatedNotes.find((n) => n.id === selectedNote.id);
      if (updatedNote) {
        setSelectedNote(updatedNote);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to pin note');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveNote = async () => {
    if (!selectedFolder || !selectedNote) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedNotes = selectedFolder.notes.map((note) =>
        note.id === selectedNote.id
          ? { ...note, archived: !note.archived, updatedAt: now }
          : note
      );

      const updatedFolder = {
        ...selectedFolder,
        notes: updatedNotes,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
      
      const updatedNote = updatedNotes.find((n) => n.id === selectedNote.id);
      if (updatedNote) {
        setSelectedNote(updatedNote);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive note');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedFolder || !selectedNote) return;
    if (!confirm('Delete this note?')) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedNotes = selectedFolder.notes.filter((note) => note.id !== selectedNote.id);

      const updatedFolder = {
        ...selectedFolder,
        notes: updatedNotes,
        updatedAt: now,
      };

      const updatedFolders = folders.map((f) =>
        f.id === selectedFolder.id ? updatedFolder : f
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveFolders(updatedFolders);
      setFolders(updatedFolders);
      setSelectedFolder(updatedFolder);
      setSelectedNote(null);
      setEditTitle('');
      setEditContent('');
      setIsEditing(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete note');
    } finally {
      setSaving(false);
    }
  };

  // Export/Import
  const handleExport = () => {
    try {
      const exportData: NotesData = { folders };
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
        
        if (!importData.folders || !Array.isArray(importData.folders)) {
          throw new Error('Invalid notes data format');
        }

        if (!confirm(`Import ${importData.folders.length} folders? This will replace all existing data.`)) {
          return;
        }

        setSaving(true);
        setError('');

        const sorted = importData.folders.sort((a, b) => b.updatedAt - a.updatedAt);
        await saveFolders(sorted);
        setFolders(sorted);
        setSelectedFolder(null);
        setSelectedNote(null);
        setIsEditing(false);

        alert(`Successfully imported ${sorted.length} folders!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import notes');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  // Helper functions
  const getVisibleFolders = () => {
    if (showArchived) {
      return folders;
    }
    return folders.filter(f => !f.archived);
  };

  const getVisibleNotes = () => {
    if (!selectedFolder) return [];
    
    let notes = showArchived ? selectedFolder.notes : selectedFolder.notes.filter(n => !n.archived);
    
    // Sort: pinned first, then by updatedAt
    return notes.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  };

  const getFolderNotesCount = (folder: NotesFolder) => {
    const activeNotes = folder.notes.filter(n => !n.archived);
    return activeNotes.length;
  };

  if (loading) {
    return (
      <div className="notes-container">
        <div className="loading">Loading notes...</div>
      </div>
    );
  }

  const visibleFolders = getVisibleFolders();
  const visibleNotes = getVisibleNotes();

  return (
    <div className="notes-container">
      {/* Left Sidebar - Folders */}
      <div className="notes-sidebar">
        <div className="sidebar-header">
          <h2>Notes</h2>
          <button onClick={handleCreateFolder} className="btn-new">
            + New Folder
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

        <div className="view-filters">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span>Show archived</span>
          </label>
        </div>

        {isCreatingFolder && (
          <div className="new-folder-form">
            <input
              type="text"
              className="folder-title-input"
              placeholder="Folder title..."
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newFolderTitle.trim()) {
                  handleSaveNewFolder();
                }
              }}
              autoFocus
            />
            <div className="form-actions">
              <button
                onClick={handleSaveNewFolder}
                disabled={saving}
                className="btn-save-small"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={handleCancelNewFolder}
                disabled={saving}
                className="btn-cancel-small"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="folders-list">
          {visibleFolders.length === 0 ? (
            <div className="empty-state">
              {showArchived ? 'No folders yet.' : 'No active folders. Create one!'}
            </div>
          ) : (
            visibleFolders.map((folder) => (
              <div
                key={folder.id}
                className={`folder-item ${selectedFolder?.id === folder.id ? 'active' : ''} ${folder.archived ? 'archived' : ''}`}
                onClick={() => handleSelectFolder(folder)}
              >
                <div className="folder-title">
                  {folder.archived && <span className="archived-badge">📦</span>}
                  {folder.title}
                </div>
                <div className="folder-count">{getFolderNotesCount(folder)} notes</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle Panel - Notes List */}
      {selectedFolder ? (
        <div className="notes-middle">
          <div className="middle-header">
            {isRenamingFolder ? (
              <div className="rename-folder-form">
                <input
                  type="text"
                  className="rename-folder-input"
                  placeholder="Folder title..."
                  value={renameFolderTitle}
                  onChange={(e) => setRenameFolderTitle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && renameFolderTitle.trim()) {
                      handleSaveRenameFolder();
                    }
                  }}
                  autoFocus
                />
                <div className="rename-actions">
                  <button
                    onClick={handleSaveRenameFolder}
                    disabled={saving}
                    className="btn-save-rename"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelRenameFolder}
                    disabled={saving}
                    className="btn-cancel-rename"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="folder-header-info">
                  <h2>{selectedFolder.title}</h2>
                  {selectedFolder.archived && <span className="folder-archived-label">Archived</span>}
                </div>
                <div className="folder-actions">
                  <button onClick={handleStartRenameFolder} className="btn-icon" title="Rename folder">
                    ✏️
                  </button>
                  <button 
                    onClick={handleToggleArchiveFolder} 
                    className="btn-icon"
                    title={selectedFolder.archived ? 'Unarchive folder' : 'Archive folder'}
                  >
                    {selectedFolder.archived ? '📂' : '📦'}
                  </button>
                  <button onClick={handleDeleteFolder} className="btn-icon-danger" title="Delete folder">
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="middle-actions">
            <button onClick={handleCreateNote} className="btn-new-note">
              + New Note
            </button>
          </div>

          <div className="notes-list">
            {visibleNotes.length === 0 ? (
              <div className="empty-state">
                {showArchived ? 'No notes in this folder.' : 'No active notes. Create one!'}
              </div>
            ) : (
              visibleNotes.map((note) => (
                <div
                  key={note.id}
                  className={`note-item ${selectedNote?.id === note.id ? 'active' : ''} ${note.archived ? 'archived' : ''}`}
                  onClick={() => handleSelectNote(note)}
                >
                  <div className="note-header">
                    <div className="note-title">
                      {note.pinned && <span className="pin-icon">📌</span>}
                      {note.archived && <span className="archived-icon">📦</span>}
                      {note.title}
                    </div>
                  </div>
                  <div className="note-preview">
                    {note.content.substring(0, 80)}
                    {note.content.length > 80 ? '...' : ''}
                  </div>
                  <div className="note-date">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Right Panel - Note Content */}
      <div className="notes-content">
        {selectedNote || isEditing ? (
          <>
            <div className="editor-header">
              {isEditing ? (
                <>
                  <button onClick={handleSaveNote} disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancelEdit} disabled={saving} className="btn-secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="note-actions-left">
                    <button onClick={handleEdit} className="btn-primary">
                      Edit
                    </button>
                    <button 
                      onClick={handleTogglePinNote} 
                      className={`btn-secondary ${selectedNote?.pinned ? 'active' : ''}`}
                      title={selectedNote?.pinned ? 'Unpin note' : 'Pin note'}
                    >
                      {selectedNote?.pinned ? '📌 Pinned' : '📌 Pin'}
                    </button>
                    <button 
                      onClick={handleToggleArchiveNote} 
                      className="btn-secondary"
                      title={selectedNote?.archived ? 'Unarchive note' : 'Archive note'}
                    >
                      {selectedNote?.archived ? '📂 Unarchive' : '📦 Archive'}
                    </button>
                  </div>
                  <button onClick={handleDeleteNote} className="btn-danger">
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
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <textarea
                  className="content-input"
                  placeholder="Write your note here..."
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              </div>
            ) : (
              <div className="viewer">
                <div className="view-header">
                  <h1 className="view-title">{selectedNote?.title}</h1>
                  <div className="view-badges">
                    {selectedNote?.pinned && <span className="badge-pinned">📌 Pinned</span>}
                    {selectedNote?.archived && <span className="badge-archived">📦 Archived</span>}
                  </div>
                </div>
                <div className="view-content">{selectedNote?.content}</div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">📝</div>
            <h3>
              {selectedFolder 
                ? 'Select a note or create a new one' 
                : 'Select a folder to view notes'}
            </h3>
            {selectedFolder && (
              <button onClick={handleCreateNote} className="btn-primary">
                Create Note
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
