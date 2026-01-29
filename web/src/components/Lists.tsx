import { useState, useEffect, useCallback } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Lists.css';

type ListItem = {
  id: string;
  title: string;
  note?: string;
  checked: boolean;
  checkedAt?: number;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
};

type List = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  items: ListItem[];
};

type ListsData = {
  lists: List[];
};

const BLOB_NAME = 'lists';

export default function Lists() {
  const [lists, setLists] = useState<List[]>([]);
  const [selectedList, setSelectedList] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // List management
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  
  // Item editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemNote, setEditItemNote] = useState('');
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  
  // View filters
  const [showArchived, setShowArchived] = useState(false);
  const [showChecked, setShowChecked] = useState(true);

  const loadLists = useCallback(async () => {
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
        
        const data: ListsData = JSON.parse(decrypted);
        const sorted = (data.lists || []).sort((a, b) => b.updatedAt - a.updatedAt);
        setLists(sorted);
      } catch (err) {
        const error = err as { status?: number };
        if (error.status === 404) {
          setLists([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const saveLists = async (updatedLists: List[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: ListsData = { lists: updatedLists };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  // List operations
  const handleCreateList = () => {
    setIsCreatingList(true);
    setNewListTitle('');
  };

  const handleSaveNewList = async () => {
    if (!newListTitle.trim()) {
      setError('List title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newList: List = {
        id: crypto.randomUUID(),
        title: newListTitle,
        items: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedLists = [newList, ...lists];
      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(newList);
      setIsCreatingList(false);
      setNewListTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create list');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewList = () => {
    setIsCreatingList(false);
    setNewListTitle('');
  };

  const handleSelectList = (list: List) => {
    setSelectedList(list);
    setEditingItemId(null);
    setIsCreatingItem(false);
  };

  const handleDeleteList = async (list: List) => {
    if (!confirm(`Delete list "${list.title}"? This will delete all items inside.`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedLists = lists.filter((l) => l.id !== list.id);
      await saveLists(updatedLists);
      setLists(updatedLists);
      if (selectedList?.id === list.id) {
        setSelectedList(null);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete list');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveList = async (list: List, e: React.MouseEvent) => {
    e.stopPropagation();

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedList = {
        ...list,
        archived: !list.archived,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === list.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      if (selectedList?.id === list.id) {
        setSelectedList(updatedList);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive list');
    } finally {
      setSaving(false);
    }
  };

  // Item operations
  const handleToggleCheckItem = async (item: ListItem) => {
    if (!selectedList) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedItems = selectedList.items.map((i) =>
        i.id === item.id
          ? { 
              ...i, 
              checked: !i.checked, 
              checkedAt: !i.checked ? now : undefined,
              updatedAt: now 
            }
          : i
      );

      const updatedList = {
        ...selectedList,
        items: updatedItems,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === selectedList.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(updatedList);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to toggle item');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditItem = (item: ListItem) => {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemNote(item.note || '');
    setIsCreatingItem(false);
  };

  const handleSaveEditItem = async (itemId: string) => {
    if (!selectedList) return;
    if (!editItemTitle.trim()) {
      setError('Item title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedItems = selectedList.items.map((item) =>
        item.id === itemId
          ? { ...item, title: editItemTitle, note: editItemNote || undefined, updatedAt: now }
          : item
      );

      const updatedList = {
        ...selectedList,
        items: updatedItems,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === selectedList.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(updatedList);
      setEditingItemId(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditItem = () => {
    setEditingItemId(null);
    setEditItemTitle('');
    setEditItemNote('');
  };

  const handleDeleteItem = async (item: ListItem) => {
    if (!selectedList) return;
    if (!confirm('Delete this item?')) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedItems = selectedList.items.filter((i) => i.id !== item.id);

      const updatedList = {
        ...selectedList,
        items: updatedItems,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === selectedList.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(updatedList);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveItem = async (item: ListItem) => {
    if (!selectedList) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedItems = selectedList.items.map((i) =>
        i.id === item.id
          ? { ...i, archived: !i.archived, updatedAt: now }
          : i
      );

      const updatedList = {
        ...selectedList,
        items: updatedItems,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === selectedList.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(updatedList);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive item');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateItem = () => {
    setIsCreatingItem(true);
    setNewItemTitle('');
    setEditingItemId(null);
  };

  const handleSaveNewItem = async () => {
    if (!selectedList) return;
    if (!newItemTitle.trim()) {
      setIsCreatingItem(false);
      setNewItemTitle('');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newItem: ListItem = {
        id: crypto.randomUUID(),
        title: newItemTitle,
        checked: false,
        createdAt: now,
        updatedAt: now,
      };

      const updatedItems = [...selectedList.items, newItem];

      const updatedList = {
        ...selectedList,
        items: updatedItems,
        updatedAt: now,
      };

      const updatedLists = lists.map((l) =>
        l.id === selectedList.id ? updatedList : l
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveLists(updatedLists);
      setLists(updatedLists);
      setSelectedList(updatedList);
      setIsCreatingItem(false);
      setNewItemTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewItem = () => {
    setIsCreatingItem(false);
    setNewItemTitle('');
  };

  // Export/Import
  const handleExport = () => {
    try {
      const exportData: ListsData = { lists };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `lists-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export lists');
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
        const importData: ListsData = JSON.parse(text);
        
        if (!importData.lists || !Array.isArray(importData.lists)) {
          throw new Error('Invalid lists data format');
        }

        if (!confirm(`Import ${importData.lists.length} lists? This will replace all existing data.`)) {
          return;
        }

        setSaving(true);
        setError('');

        const sorted = importData.lists.sort((a, b) => b.updatedAt - a.updatedAt);
        await saveLists(sorted);
        setLists(sorted);
        setSelectedList(null);

        alert(`Successfully imported ${sorted.length} lists!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import lists');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  // Helper functions
  const getVisibleLists = () => {
    if (showArchived) {
      return lists;
    }
    return lists.filter(l => !l.archived);
  };

  const getVisibleItems = () => {
    if (!selectedList) return [];
    
    let items = showArchived ? selectedList.items : selectedList.items.filter(i => !i.archived);
    
    if (!showChecked) {
      items = items.filter(i => !i.checked);
    }
    
    // Sort: unchecked first, then by createdAt
    return items.sort((a, b) => {
      if (!a.checked && b.checked) return -1;
      if (a.checked && !b.checked) return 1;
      return a.createdAt - b.createdAt;
    });
  };

  const getListItemsCount = (list: List) => {
    const activeItems = list.items.filter(i => !i.archived);
    const uncheckedCount = activeItems.filter(i => !i.checked).length;
    return { total: activeItems.length, unchecked: uncheckedCount };
  };

  if (loading) {
    return (
      <div className="lists-container">
        <div className="loading">Loading lists...</div>
      </div>
    );
  }

  const visibleLists = getVisibleLists();
  const visibleItems = getVisibleItems();

  return (
    <div className="lists-container">
      {/* Left Sidebar - Lists */}
      <div className="lists-sidebar">
        <div className="sidebar-header">
          <h2>Lists</h2>
          <button onClick={handleCreateList} className="btn-new">
            + New List
          </button>
        </div>
        
        <div className="sidebar-actions">
          <button onClick={handleExport} className="btn-export" title="Export lists">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import lists">
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

        {isCreatingList && (
          <div className="new-list-form">
            <input
              type="text"
              className="list-title-input"
              placeholder="New list..."
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newListTitle.trim()) {
                  handleSaveNewList();
                } else if (e.key === 'Escape') {
                  handleCancelNewList();
                }
              }}
              onBlur={handleCancelNewList}
              autoFocus
            />
          </div>
        )}
        
        <div className="lists-list">
          {visibleLists.length === 0 ? (
            <div className="empty-state">
              {showArchived ? 'No lists yet.' : 'No active lists. Create one!'}
            </div>
          ) : (
            visibleLists.map((list) => {
              const counts = getListItemsCount(list);
              return (
                <div
                  key={list.id}
                  className={`list-item ${selectedList?.id === list.id ? 'active' : ''} ${list.archived ? 'archived' : ''}`}
                  onClick={() => handleSelectList(list)}
                >
                  <div className="list-item-main">
                    <div className="list-title">
                      {list.archived && <span className="archived-badge">📦</span>}
                      {list.title}
                    </div>
                    <div className="list-count">
                      {counts.unchecked > 0 ? counts.unchecked : counts.total}
                    </div>
                  </div>
                  <button
                    className="btn-archive-list"
                    onClick={(e) => handleToggleArchiveList(list, e)}
                    title={list.archived ? 'Unarchive list' : 'Archive list'}
                  >
                    {list.archived ? '📂' : '📦'}
                  </button>
                  <button
                    className="btn-delete-list"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteList(list);
                    }}
                    title="Delete list"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - List Items */}
      <div className="lists-content">
        {selectedList ? (
          <>
            <div className="content-header">
              <h1>{selectedList.title}</h1>
              <div className="header-actions">
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={showChecked}
                    onChange={(e) => setShowChecked(e.target.checked)}
                  />
                  <span>Show checked</span>
                </label>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="items-list">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className={`item-row ${item.checked ? 'checked' : ''} ${editingItemId === item.id ? 'editing' : ''}`}
                >
                  {editingItemId === item.id ? (
                    <div className="item-edit-form">
                      <div className="item-edit-main">
                        <input
                          type="text"
                          className="item-edit-title"
                          placeholder="Item title..."
                          value={editItemTitle}
                          onChange={(e) => setEditItemTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEditItem(item.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEditItem();
                            }
                          }}
                          autoFocus
                        />
                        <textarea
                          className="item-edit-note"
                          placeholder="Note (optional)..."
                          value={editItemNote}
                          onChange={(e) => setEditItemNote(e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="item-edit-actions">
                        <button
                          onClick={() => handleSaveEditItem(item.id)}
                          disabled={saving}
                          className="btn-save"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditItem}
                          disabled={saving}
                          className="btn-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleToggleCheckItem(item)}
                        className="item-checkbox"
                        disabled={saving}
                      />
                      <div 
                        className="item-content"
                        onClick={() => handleStartEditItem(item)}
                      >
                        <div className="item-title">
                          {item.archived && <span className="archived-icon">📦</span>}
                          {item.title}
                        </div>
                        {item.note && (
                          <div className="item-note">
                            {item.note}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn-archive-item"
                        onClick={() => handleToggleArchiveItem(item)}
                        title={item.archived ? 'Unarchive item' : 'Archive item'}
                      >
                        {item.archived ? '📂' : '📦'}
                      </button>
                      <button
                        className="btn-delete-item"
                        onClick={() => handleDeleteItem(item)}
                        title="Delete item"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}

              {isCreatingItem && (
                <div className="item-row new-item">
                  <div className="item-checkbox-placeholder"></div>
                  <input
                    type="text"
                    className="new-item-input"
                    placeholder="New item..."
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveNewItem();
                      } else if (e.key === 'Escape') {
                        handleCancelNewItem();
                      }
                    }}
                    onBlur={handleSaveNewItem}
                    autoFocus
                  />
                </div>
              )}

              {!isCreatingItem && (
                <button onClick={handleCreateItem} className="btn-add-item">
                  + New Item
                </button>
              )}

              {visibleItems.length === 0 && !isCreatingItem && (
                <div className="empty-state-center">
                  <div className="empty-icon">✅</div>
                  <p>No items yet. Click "New Item" to add one.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">✅</div>
            <h3>Select a list to view items</h3>
          </div>
        )}
      </div>
    </div>
  );
}
