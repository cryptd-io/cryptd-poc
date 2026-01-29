import { useState, useEffect, useCallback } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Boards.css';

type BoardCard = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
};

type BoardColumn = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  cards: BoardCard[];
};

type Board = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  columns: BoardColumn[];
};

type BoardsData = {
  boards: Board[];
};

const BLOB_NAME = 'boards';

export default function Boards() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Board management
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [isRenamingBoard, setIsRenamingBoard] = useState(false);
  const [renameBoardTitle, setRenameBoardTitle] = useState('');
  
  // Column management
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editColumnTitle, setEditColumnTitle] = useState('');
  
  // Card management
  const [newCardTitles, setNewCardTitles] = useState<{ [columnId: string]: string }>({});
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardTitle, setEditCardTitle] = useState('');
  const [editCardContent, setEditCardContent] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  
  // View filters
  const [showArchived, setShowArchived] = useState(false);
  
  // Drag and drop
  const [draggedCard, setDraggedCard] = useState<{ card: BoardCard; fromColumnId: string } | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
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
        
        const data: BoardsData = JSON.parse(decrypted);
        const sorted = (data.boards || []).sort((a, b) => b.updatedAt - a.updatedAt);
        setBoards(sorted);
      } catch (err) {
        const error = err as { status?: number };
        if (error.status === 404) {
          setBoards([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load boards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const saveBoards = async (updatedBoards: Board[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: BoardsData = { boards: updatedBoards };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  // Board operations
  const handleCreateBoard = () => {
    setIsCreatingBoard(true);
    setNewBoardTitle('');
  };

  const handleSaveNewBoard = async () => {
    if (!newBoardTitle.trim()) {
      setError('Board title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newBoard: Board = {
        id: crypto.randomUUID(),
        title: newBoardTitle,
        columns: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedBoards = [newBoard, ...boards];
      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(newBoard);
      setIsCreatingBoard(false);
      setNewBoardTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create board');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewBoard = () => {
    setIsCreatingBoard(false);
    setNewBoardTitle('');
  };

  const handleSelectBoard = (board: Board) => {
    setSelectedBoard(board);
    setNewCardTitles({});
    setEditingCardId(null);
    setExpandedCardId(null);
  };

  const handleStartRenameBoard = () => {
    if (!selectedBoard) return;
    setIsRenamingBoard(true);
    setRenameBoardTitle(selectedBoard.title);
  };

  const handleSaveRenameBoard = async () => {
    if (!selectedBoard) return;
    if (!renameBoardTitle.trim()) {
      setError('Board title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedBoard = {
        ...selectedBoard,
        title: renameBoardTitle,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      setIsRenamingBoard(false);
      setRenameBoardTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to rename board');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRenameBoard = () => {
    setIsRenamingBoard(false);
    setRenameBoardTitle('');
  };

  const handleToggleArchiveBoard = async () => {
    if (!selectedBoard) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedBoard = {
        ...selectedBoard,
        archived: !selectedBoard.archived,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive board');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!selectedBoard) return;
    if (!confirm(`Delete board "${selectedBoard.title}"? This will delete all columns and cards.`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedBoards = boards.filter((b) => b.id !== selectedBoard.id);
      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete board');
    } finally {
      setSaving(false);
    }
  };

  // Column operations
  const handleAddColumn = async () => {
    if (!selectedBoard) return;
    if (!newColumnTitle.trim()) {
      setError('Column title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newColumn: BoardColumn = {
        id: crypto.randomUUID(),
        title: newColumnTitle,
        cards: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedBoard = {
        ...selectedBoard,
        columns: [...selectedBoard.columns, newColumn],
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      setNewColumnTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to add column');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditColumn = (columnId: string, currentTitle: string) => {
    setEditingColumnId(columnId);
    setEditColumnTitle(currentTitle);
  };

  const handleSaveEditColumn = async (columnId: string) => {
    if (!selectedBoard) return;
    if (!editColumnTitle.trim()) {
      setError('Column title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? { ...col, title: editColumnTitle, updatedAt: now }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      setEditingColumnId(null);
      setEditColumnTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update column');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditColumn = () => {
    setEditingColumnId(null);
    setEditColumnTitle('');
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!selectedBoard) return;
    const column = selectedBoard.columns.find((c) => c.id === columnId);
    if (!column) return;
    if (column.cards.length > 0) {
      if (!confirm(`Delete column "${column.title}" with ${column.cards.length} cards?`)) return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.filter((col) => col.id !== columnId);

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete column');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveColumn = async (columnId: string) => {
    if (!selectedBoard) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? { ...col, archived: !col.archived, updatedAt: now }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive column');
    } finally {
      setSaving(false);
    }
  };

  // Card operations
  const handleAddCard = async (columnId: string) => {
    if (!selectedBoard) return;
    const cardTitle = newCardTitles[columnId] || '';
    if (!cardTitle.trim()) {
      setError('Card title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newCard: BoardCard = {
        id: crypto.randomUUID(),
        title: cardTitle,
        createdAt: now,
        updatedAt: now,
      };

      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? { ...col, cards: [...col.cards, newCard], updatedAt: now }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      setNewCardTitles({ ...newCardTitles, [columnId]: '' });
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to add card');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditCard = (card: BoardCard) => {
    setEditingCardId(card.id);
    setEditCardTitle(card.title);
    setEditCardContent(card.content || '');
    setExpandedCardId(null);
  };

  const handleSaveEditCard = async (columnId: string, cardId: string) => {
    if (!selectedBoard) return;
    if (!editCardTitle.trim()) {
      setError('Card title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId
                  ? { ...card, title: editCardTitle, content: editCardContent, updatedAt: now }
                  : card
              ),
              updatedAt: now,
            }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      setEditingCardId(null);
      setEditCardTitle('');
      setEditCardContent('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to update card');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditCard = () => {
    setEditingCardId(null);
    setEditCardTitle('');
    setEditCardContent('');
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    if (!selectedBoard) return;
    if (!confirm('Delete this card?')) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.filter((card) => card.id !== cardId),
              updatedAt: now,
            }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
      if (expandedCardId === cardId) {
        setExpandedCardId(null);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete card');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveCard = async (columnId: string, cardId: string) => {
    if (!selectedBoard) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) =>
        col.id === columnId
          ? {
              ...col,
              cards: col.cards.map((card) =>
                card.id === cardId
                  ? { ...card, archived: !card.archived, updatedAt: now }
                  : card
              ),
              updatedAt: now,
            }
          : col
      );

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive card');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExpandCard = (cardId: string) => {
    setExpandedCardId(expandedCardId === cardId ? null : cardId);
  };

  // Drag and drop handlers
  const handleDragStart = (card: BoardCard, columnId: string) => {
    setDraggedCard({ card, fromColumnId: columnId });
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverColumnId(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumnId(null);
  };

  const handleDrop = async (e: React.DragEvent, toColumnId: string) => {
    e.preventDefault();
    if (!selectedBoard || !draggedCard) return;

    const { card, fromColumnId } = draggedCard;
    
    // If dropping in same column, do nothing
    if (fromColumnId === toColumnId) {
      setDraggedCard(null);
      setDragOverColumnId(null);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedColumns = selectedBoard.columns.map((col) => {
        if (col.id === fromColumnId) {
          // Remove card from source column
          return {
            ...col,
            cards: col.cards.filter((c) => c.id !== card.id),
            updatedAt: now,
          };
        } else if (col.id === toColumnId) {
          // Add card to target column
          return {
            ...col,
            cards: [...col.cards, { ...card, updatedAt: now }],
            updatedAt: now,
          };
        }
        return col;
      });

      const updatedBoard = {
        ...selectedBoard,
        columns: updatedColumns,
        updatedAt: now,
      };

      const updatedBoards = boards.map((b) =>
        b.id === selectedBoard.id ? updatedBoard : b
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveBoards(updatedBoards);
      setBoards(updatedBoards);
      setSelectedBoard(updatedBoard);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to move card');
    } finally {
      setSaving(false);
      setDraggedCard(null);
      setDragOverColumnId(null);
    }
  };

  // Export/Import
  const handleExport = () => {
    try {
      const exportData: BoardsData = { boards };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `boards-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export boards');
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
        const importData: BoardsData = JSON.parse(text);
        
        if (!importData.boards || !Array.isArray(importData.boards)) {
          throw new Error('Invalid boards data format');
        }

        if (!confirm(`Import ${importData.boards.length} boards? This will replace all existing data.`)) {
          return;
        }

        setSaving(true);
        setError('');

        const sorted = importData.boards.sort((a, b) => b.updatedAt - a.updatedAt);
        await saveBoards(sorted);
        setBoards(sorted);
        setSelectedBoard(null);

        alert(`Successfully imported ${sorted.length} boards!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import boards');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  // Helper functions
  const getVisibleBoards = () => {
    if (showArchived) {
      return boards;
    }
    return boards.filter(b => !b.archived);
  };

  const getVisibleColumns = () => {
    if (!selectedBoard) return [];
    let columns = showArchived ? selectedBoard.columns : selectedBoard.columns.filter(c => !c.archived);
    
    // Filter cards within each column based on showArchived
    columns = columns.map(col => ({
      ...col,
      cards: showArchived ? col.cards : col.cards.filter(card => !card.archived)
    }));
    
    return columns;
  };

  const getBoardStats = (board: Board) => {
    const totalColumns = board.columns.length;
    const totalCards = board.columns.reduce((sum, col) => sum + col.cards.length, 0);
    return { totalColumns, totalCards };
  };

  if (loading) {
    return (
      <div className="boards-container">
        <div className="loading">Loading boards...</div>
      </div>
    );
  }

  const visibleBoards = getVisibleBoards();
  const visibleColumns = getVisibleColumns();

  return (
    <div className="boards-container">
      {/* Left Sidebar - Boards */}
      <div className="boards-sidebar">
        <div className="sidebar-header">
          <h2>Boards</h2>
          <button onClick={handleCreateBoard} className="btn-new">
            + New Board
          </button>
        </div>
        
        <div className="sidebar-actions">
          <button onClick={handleExport} className="btn-export" title="Export boards">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import boards">
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

        {isCreatingBoard && (
          <div className="new-board-form">
            <input
              type="text"
              className="board-title-input"
              placeholder="Board title..."
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newBoardTitle.trim()) {
                  handleSaveNewBoard();
                }
              }}
              autoFocus
            />
            <div className="form-actions">
              <button
                onClick={handleSaveNewBoard}
                disabled={saving}
                className="btn-save-small"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={handleCancelNewBoard}
                disabled={saving}
                className="btn-cancel-small"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="boards-list">
          {visibleBoards.length === 0 ? (
            <div className="empty-state">
              {showArchived ? 'No boards yet.' : 'No active boards. Create one!'}
            </div>
          ) : (
            visibleBoards.map((board) => {
              const stats = getBoardStats(board);
              return (
                <div
                  key={board.id}
                  className={`board-item ${selectedBoard?.id === board.id ? 'active' : ''} ${board.archived ? 'archived' : ''}`}
                  onClick={() => handleSelectBoard(board)}
                >
                  <div className="board-title">
                    {board.archived && <span className="archived-badge">📦</span>}
                    {board.title}
                  </div>
                  <div className="board-stats">
                    {stats.totalColumns} columns · {stats.totalCards} cards
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Board View */}
      <div className="board-content">
        {selectedBoard ? (
          <>
            <div className="board-header">
              {isRenamingBoard ? (
                <div className="rename-board-form">
                  <input
                    type="text"
                    className="rename-board-input"
                    placeholder="Board title..."
                    value={renameBoardTitle}
                    onChange={(e) => setRenameBoardTitle(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && renameBoardTitle.trim()) {
                        handleSaveRenameBoard();
                      }
                    }}
                    autoFocus
                  />
                  <div className="rename-actions">
                    <button
                      onClick={handleSaveRenameBoard}
                      disabled={saving}
                      className="btn-save-rename"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelRenameBoard}
                      disabled={saving}
                      className="btn-cancel-rename"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="board-header-info">
                    <h1>{selectedBoard.title}</h1>
                    {selectedBoard.archived && <span className="board-archived-label">Archived</span>}
                  </div>
                  <div className="board-actions">
                    <button onClick={handleStartRenameBoard} className="btn-icon" title="Rename board">
                      ✏️
                    </button>
                    <button 
                      onClick={handleToggleArchiveBoard} 
                      className="btn-icon"
                      title={selectedBoard.archived ? 'Unarchive board' : 'Archive board'}
                    >
                      {selectedBoard.archived ? '📂' : '📦'}
                    </button>
                    <button onClick={handleDeleteBoard} className="btn-icon-danger" title="Delete board">
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="board-columns-container">
              <div className="board-columns">
                {visibleColumns.map((column) => (
                  <div
                    key={column.id}
                    className={`board-column ${dragOverColumnId === column.id ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleDragOver(e, column.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, column.id)}
                  >
                    <div className="column-header">
                      {editingColumnId === column.id ? (
                        <div className="column-edit-form">
                          <input
                            type="text"
                            className="column-edit-input"
                            value={editColumnTitle}
                            onChange={(e) => setEditColumnTitle(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter' && editColumnTitle.trim()) {
                                handleSaveEditColumn(column.id);
                              }
                            }}
                            autoFocus
                          />
                          <div className="column-edit-actions">
                            <button
                              onClick={() => handleSaveEditColumn(column.id)}
                              disabled={saving}
                              className="btn-save-small"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEditColumn}
                              disabled={saving}
                              className="btn-cancel-small"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="column-title">
                            {column.archived && <span className="archived-badge">📦</span>}
                            {column.title}
                            <span className="card-count">{column.cards.length}</span>
                          </h3>
                          <div className="column-actions">
                            <button
                              onClick={() => handleStartEditColumn(column.id, column.title)}
                              className="btn-column-action"
                              title="Edit column"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleToggleArchiveColumn(column.id)}
                              className="btn-column-action"
                              title={column.archived ? 'Unarchive column' : 'Archive column'}
                            >
                              {column.archived ? '📂' : '📦'}
                            </button>
                            <button
                              onClick={() => handleDeleteColumn(column.id)}
                              className="btn-column-action"
                              title="Delete column"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="column-cards">
                      {column.cards.map((card) => (
                        <div
                          key={card.id}
                          className={`board-card ${expandedCardId === card.id ? 'expanded' : ''} ${editingCardId === card.id ? 'editing' : ''} ${card.archived ? 'archived' : ''}`}
                          draggable={editingCardId !== card.id}
                          onDragStart={() => handleDragStart(card, column.id)}
                          onDragEnd={handleDragEnd}
                        >
                          {editingCardId === card.id ? (
                            <div className="card-edit-form">
                              <input
                                type="text"
                                className="card-edit-title"
                                placeholder="Card title..."
                                value={editCardTitle}
                                onChange={(e) => setEditCardTitle(e.target.value)}
                              />
                              <textarea
                                className="card-edit-content"
                                placeholder="Card description (optional)..."
                                value={editCardContent}
                                onChange={(e) => setEditCardContent(e.target.value)}
                                rows={4}
                              />
                              <div className="card-edit-actions">
                                <button
                                  onClick={() => handleSaveEditCard(column.id, card.id)}
                                  disabled={saving}
                                  className="btn-save"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEditCard}
                                  disabled={saving}
                                  className="btn-cancel"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                className="card-content"
                                onClick={() => handleToggleExpandCard(card.id)}
                              >
                                <div className="card-title">
                                  {card.archived && <span className="archived-badge">📦</span>}
                                  {card.title}
                                </div>
                                {card.content && (
                                  <div className={`card-description ${expandedCardId === card.id ? 'expanded' : ''}`}>
                                    {card.content}
                                  </div>
                                )}
                              </div>
                              <div className="card-actions">
                                <button
                                  onClick={() => handleStartEditCard(card)}
                                  className="btn-card-action"
                                  title="Edit card"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleToggleArchiveCard(column.id, card.id)}
                                  className="btn-card-action"
                                  title={card.archived ? 'Unarchive card' : 'Archive card'}
                                >
                                  {card.archived ? '📂' : '📦'}
                                </button>
                                <button
                                  onClick={() => handleDeleteCard(column.id, card.id)}
                                  className="btn-card-action"
                                  title="Delete card"
                                >
                                  🗑️
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* New card input */}
                      <div className="new-card-form">
                        <input
                          type="text"
                          className="new-card-input"
                          placeholder="+ Add a card"
                          value={newCardTitles[column.id] || ''}
                          onChange={(e) =>
                            setNewCardTitles({ ...newCardTitles, [column.id]: e.target.value })
                          }
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && newCardTitles[column.id]?.trim()) {
                              handleAddCard(column.id);
                            }
                          }}
                        />
                        {newCardTitles[column.id]?.trim() && (
                          <button
                            onClick={() => handleAddCard(column.id)}
                            disabled={saving}
                            className="btn-add-card"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add new column */}
                <div className="add-column-container">
                  <input
                    type="text"
                    className="new-column-input"
                    placeholder="+ Add column"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newColumnTitle.trim()) {
                        handleAddColumn();
                      }
                    }}
                  />
                  {newColumnTitle.trim() && (
                    <button
                      onClick={handleAddColumn}
                      disabled={saving}
                      className="btn-add-column"
                    >
                      Add Column
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">📋</div>
            <h3>Select a board or create a new one</h3>
            <button onClick={handleCreateBoard} className="btn-primary">
              Create Board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
