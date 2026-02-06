import { useState, useEffect, useCallback } from 'react';
import { loadAuthState } from '../lib/auth';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { upsertBlob, getBlob } from '../lib/api';
import './Contacts.css';

type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  birthday?: string; // YYYY-MM-DD
  notes?: string;
  favorite?: boolean;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
};

type ContactGroup = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  contacts: Contact[];
};

type ContactsData = {
  groups: ContactGroup[];
};

const BLOB_NAME = 'contacts';

export default function Contacts() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Group management
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [renameGroupTitle, setRenameGroupTitle] = useState('');
  
  // Contact editing
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editNotes, setEditNotes] = useState('');
  
  // View filters
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpcomingBirthdays, setShowUpcomingBirthdays] = useState(false);

  const loadGroups = useCallback(async () => {
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
        
        const data: ContactsData = JSON.parse(decrypted);
        const sorted = (data.groups || []).sort((a, b) => b.updatedAt - a.updatedAt);
        setGroups(sorted);
      } catch (err) {
        const error = err as { status?: number };
        if (error.status === 404) {
          setGroups([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const saveGroups = async (updatedGroups: ContactGroup[]) => {
    const authState = loadAuthState();
    if (!authState) throw new Error('Not authenticated');

    const data: ContactsData = { groups: updatedGroups };
    const encrypted = await encryptBlob(
      data,
      authState.accountKey,
      BLOB_NAME
    );

    await upsertBlob(authState.token, BLOB_NAME, {
      encryptedBlob: encrypted,
    });
  };

  // Group operations
  const handleCreateGroup = () => {
    setIsCreatingGroup(true);
    setNewGroupTitle('');
  };

  const handleSaveNewGroup = async () => {
    if (!newGroupTitle.trim()) {
      setError('Group title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const newGroup: ContactGroup = {
        id: crypto.randomUUID(),
        title: newGroupTitle,
        contacts: [],
        createdAt: now,
        updatedAt: now,
      };

      const updatedGroups = [newGroup, ...groups];
      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(newGroup);
      setIsCreatingGroup(false);
      setNewGroupTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewGroup = () => {
    setIsCreatingGroup(false);
    setNewGroupTitle('');
  };

  const handleSelectGroup = (group: ContactGroup) => {
    setSelectedGroup(group);
    setSelectedContact(null);
    setIsEditing(false);
    setSearchQuery('');
  };

  const handleStartRenameGroup = () => {
    if (!selectedGroup) return;
    setIsRenamingGroup(true);
    setRenameGroupTitle(selectedGroup.title);
  };

  const handleSaveRenameGroup = async () => {
    if (!selectedGroup) return;
    if (!renameGroupTitle.trim()) {
      setError('Group title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedGroup = {
        ...selectedGroup,
        title: renameGroupTitle,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
      setIsRenamingGroup(false);
      setRenameGroupTitle('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to rename group');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRenameGroup = () => {
    setIsRenamingGroup(false);
    setRenameGroupTitle('');
  };

  const handleToggleArchiveGroup = async () => {
    if (!selectedGroup) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedGroup = {
        ...selectedGroup,
        archived: !selectedGroup.archived,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive group');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Delete group "${selectedGroup.title}"? This will delete all contacts inside.`)) return;

    setSaving(true);
    setError('');

    try {
      const updatedGroups = groups.filter((g) => g.id !== selectedGroup.id);
      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(null);
      setSelectedContact(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete group');
    } finally {
      setSaving(false);
    }
  };

  // Contact operations
  const handleCreateContact = () => {
    if (!selectedGroup) return;
    setIsEditing(true);
    setSelectedContact(null);
    setEditName('');
    setEditEmail('');
    setEditPhone('');
    setEditAddress('');
    setEditBirthday('');
    setEditNotes('');
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setEditName(contact.name);
    setEditEmail(contact.email || '');
    setEditPhone(contact.phone || '');
    setEditAddress(contact.address || '');
    setEditBirthday(contact.birthday || '');
    setEditNotes(contact.notes || '');
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveContact = async () => {
    if (!selectedGroup) return;
    if (!editName.trim()) {
      setError('Contact name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      let updatedContacts: Contact[];

      if (selectedContact) {
        // Update existing contact
        updatedContacts = selectedGroup.contacts.map((contact) =>
          contact.id === selectedContact.id
            ? {
                ...contact,
                name: editName,
                email: editEmail || undefined,
                phone: editPhone || undefined,
                address: editAddress || undefined,
                birthday: editBirthday || undefined,
                notes: editNotes || undefined,
                updatedAt: now,
              }
            : contact
        );
      } else {
        // Create new contact
        const newContact: Contact = {
          id: crypto.randomUUID(),
          name: editName,
          email: editEmail || undefined,
          phone: editPhone || undefined,
          address: editAddress || undefined,
          birthday: editBirthday || undefined,
          notes: editNotes || undefined,
          createdAt: now,
          updatedAt: now,
        };
        updatedContacts = [newContact, ...selectedGroup.contacts];
      }

      const updatedGroup = {
        ...selectedGroup,
        contacts: updatedContacts,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
      
      // Select the saved contact
      const savedContact = updatedContacts.find((c) => c.name === editName);
      if (savedContact) {
        setSelectedContact(savedContact);
      }
      setIsEditing(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (selectedContact) {
      setEditName(selectedContact.name);
      setEditEmail(selectedContact.email || '');
      setEditPhone(selectedContact.phone || '');
      setEditAddress(selectedContact.address || '');
      setEditBirthday(selectedContact.birthday || '');
      setEditNotes(selectedContact.notes || '');
      setIsEditing(false);
    } else {
      setEditName('');
      setEditEmail('');
      setEditPhone('');
      setEditAddress('');
      setEditBirthday('');
      setEditNotes('');
      setIsEditing(false);
    }
  };

  const handleToggleFavoriteContact = async () => {
    if (!selectedGroup || !selectedContact) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedContacts = selectedGroup.contacts.map((contact) =>
        contact.id === selectedContact.id
          ? { ...contact, favorite: !contact.favorite, updatedAt: now }
          : contact
      );

      const updatedGroup = {
        ...selectedGroup,
        contacts: updatedContacts,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
      
      const updatedContact = updatedContacts.find((c) => c.id === selectedContact.id);
      if (updatedContact) {
        setSelectedContact(updatedContact);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to favorite contact');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchiveContact = async () => {
    if (!selectedGroup || !selectedContact) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedContacts = selectedGroup.contacts.map((contact) =>
        contact.id === selectedContact.id
          ? { ...contact, archived: !contact.archived, updatedAt: now }
          : contact
      );

      const updatedGroup = {
        ...selectedGroup,
        contacts: updatedContacts,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
      
      const updatedContact = updatedContacts.find((c) => c.id === selectedContact.id);
      if (updatedContact) {
        setSelectedContact(updatedContact);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to archive contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedGroup || !selectedContact) return;
    if (!confirm('Delete this contact?')) return;

    setSaving(true);
    setError('');

    try {
      const now = Date.now();
      const updatedContacts = selectedGroup.contacts.filter((contact) => contact.id !== selectedContact.id);

      const updatedGroup = {
        ...selectedGroup,
        contacts: updatedContacts,
        updatedAt: now,
      };

      const updatedGroups = groups.map((g) =>
        g.id === selectedGroup.id ? updatedGroup : g
      ).sort((a, b) => b.updatedAt - a.updatedAt);

      await saveGroups(updatedGroups);
      setGroups(updatedGroups);
      setSelectedGroup(updatedGroup);
      setSelectedContact(null);
      setIsEditing(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to delete contact');
    } finally {
      setSaving(false);
    }
  };

  // Export/Import
  const handleExport = () => {
    try {
      const exportData: ContactsData = { groups };
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `contacts-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to export contacts');
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
        const importData: ContactsData = JSON.parse(text);
        
        if (!importData.groups || !Array.isArray(importData.groups)) {
          throw new Error('Invalid contacts data format');
        }

        if (!confirm(`Import ${importData.groups.length} groups? This will replace all existing data.`)) {
          return;
        }

        setSaving(true);
        setError('');

        const sorted = importData.groups.sort((a, b) => b.updatedAt - a.updatedAt);
        await saveGroups(sorted);
        setGroups(sorted);
        setSelectedGroup(null);
        setSelectedContact(null);
        setIsEditing(false);

        alert(`Successfully imported ${sorted.length} groups!`);
      } catch (err) {
        const error = err as Error;
        setError(error.message || 'Failed to import contacts');
      } finally {
        setSaving(false);
      }
    };
    
    input.click();
  };

  // Birthday helper functions
  const getDaysUntilBirthday = (birthday: string): number => {
    const today = new Date();
    const [, month, day] = birthday.split('-').map(Number);
    
    // Create birthday date for this year
    let nextBirthday = new Date(today.getFullYear(), month - 1, day);
    
    // If birthday already passed this year, use next year
    if (nextBirthday < today) {
      nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
    }
    
    // Calculate days difference
    const diffTime = nextBirthday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const getAge = (birthday: string): number => {
    const today = new Date();
    const [year, month, day] = birthday.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const getNextAge = (birthday: string): number => {
    return getAge(birthday) + 1;
  };

  const formatBirthday = (birthday: string): string => {
    const [year, month, day] = birthday.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatBirthdayShort = (birthday: string): string => {
    const [, month, day] = birthday.split('-').map(Number);
    const date = new Date(2000, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const groupContactsByUpcomingBirthday = (contacts: Contact[]): Map<string, Contact[]> => {
    const grouped = new Map<string, Contact[]>();
    const withBirthdays = contacts.filter(c => c.birthday);
    
    // Sort by days until birthday
    const sorted = withBirthdays.sort((a, b) => {
      if (!a.birthday || !b.birthday) return 0;
      return getDaysUntilBirthday(a.birthday) - getDaysUntilBirthday(b.birthday);
    });
    
    // Group by time periods
    sorted.forEach(contact => {
      if (!contact.birthday) return;
      
      const daysUntil = getDaysUntilBirthday(contact.birthday);
      let groupKey: string;
      
      if (daysUntil === 0) {
        groupKey = 'Today';
      } else if (daysUntil === 1) {
        groupKey = 'Tomorrow';
      } else if (daysUntil <= 7) {
        groupKey = 'This Week';
      } else if (daysUntil <= 30) {
        groupKey = 'This Month';
      } else if (daysUntil <= 60) {
        groupKey = 'Next Month';
      } else if (daysUntil <= 90) {
        groupKey = 'Next 3 Months';
      } else {
        groupKey = 'Later';
      }
      
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(contact);
    });
    
    return grouped;
  };

  // Helper functions
  const getVisibleGroups = () => {
    if (showArchived) {
      return groups;
    }
    return groups.filter(g => !g.archived);
  };

  const getVisibleContacts = () => {
    if (!selectedGroup) return [];
    
    let contacts = showArchived ? selectedGroup.contacts : selectedGroup.contacts.filter(c => !c.archived);
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query)
      );
    }
    
    // Sort: favorites first, then by name (or birthday if in birthday view)
    return contacts.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      
      // If showing upcoming birthdays, sort by days until birthday
      if (showUpcomingBirthdays) {
        if (a.birthday && !b.birthday) return -1;
        if (!a.birthday && b.birthday) return 1;
        if (a.birthday && b.birthday) {
          return getDaysUntilBirthday(a.birthday) - getDaysUntilBirthday(b.birthday);
        }
      }
      
      return a.name.localeCompare(b.name);
    });
  };

  const getAllContactsWithBirthdays = (): Contact[] => {
    const allContacts: Contact[] = [];
    groups.forEach(group => {
      if (!showArchived && group.archived) return;
      group.contacts.forEach(contact => {
        if (!showArchived && contact.archived) return;
        if (contact.birthday) {
          allContacts.push(contact);
        }
      });
    });
    return allContacts;
  };

  const getGroupContactsCount = (group: ContactGroup) => {
    const activeContacts = group.contacts.filter(c => !c.archived);
    return activeContacts.length;
  };

  if (loading) {
    return (
      <div className="contacts-container">
        <div className="loading">Loading contacts...</div>
      </div>
    );
  }

  const visibleGroups = getVisibleGroups();
  const visibleContacts = getVisibleContacts();

  return (
    <div className="contacts-container">
      {/* Left Sidebar - Groups */}
      <div className="contacts-sidebar">
        <div className="sidebar-header">
          <h2>Contacts</h2>
          <button onClick={handleCreateGroup} className="btn-new">
            + New Group
          </button>
        </div>
        
        <div className="sidebar-actions">
          <button onClick={handleExport} className="btn-export" title="Export contacts">
            📥 Export
          </button>
          <button onClick={handleImport} className="btn-import" title="Import contacts">
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
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showUpcomingBirthdays}
              onChange={(e) => setShowUpcomingBirthdays(e.target.checked)}
            />
            <span>🎂 Upcoming birthdays</span>
          </label>
        </div>

        {isCreatingGroup && (
          <div className="new-group-form">
            <input
              type="text"
              className="group-title-input"
              placeholder="Group title..."
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newGroupTitle.trim()) {
                  handleSaveNewGroup();
                }
              }}
              autoFocus
            />
            <div className="form-actions">
              <button
                onClick={handleSaveNewGroup}
                disabled={saving}
                className="btn-save-small"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={handleCancelNewGroup}
                disabled={saving}
                className="btn-cancel-small"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="groups-list">
          {visibleGroups.length === 0 ? (
            <div className="empty-state">
              {showArchived ? 'No groups yet.' : 'No active groups. Create one!'}
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div
                key={group.id}
                className={`group-item ${selectedGroup?.id === group.id ? 'active' : ''} ${group.archived ? 'archived' : ''}`}
                onClick={() => handleSelectGroup(group)}
              >
                <div className="group-title">
                  {group.archived && <span className="archived-badge">📦</span>}
                  {group.title}
                </div>
                <div className="group-count">{getGroupContactsCount(group)} contacts</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle Panel - Contacts List or Birthday View */}
      {showUpcomingBirthdays ? (
        <div className="contacts-middle">
          <div className="middle-header">
            <div className="group-header-info">
              <h2>🎂 Upcoming Birthdays</h2>
            </div>
          </div>

          <div className="birthdays-list">
            {(() => {
              const allContactsWithBirthdays = getAllContactsWithBirthdays();
              
              if (allContactsWithBirthdays.length === 0) {
                return (
                  <div className="empty-state">
                    No birthdays on record. Add birthdays to your contacts!
                  </div>
                );
              }

              const grouped = groupContactsByUpcomingBirthday(allContactsWithBirthdays);
              const orderedKeys = ['Today', 'Tomorrow', 'This Week', 'This Month', 'Next Month', 'Next 3 Months', 'Later'];
              
              return orderedKeys.map(key => {
                const contacts = grouped.get(key);
                if (!contacts || contacts.length === 0) return null;
                
                return (
                  <div key={key} className="birthday-section">
                    <div className="birthday-section-header">
                      <h3>{key}</h3>
                      <span className="birthday-count">{contacts.length}</span>
                    </div>
                    <div className="birthday-contacts">
                      {contacts.map(contact => (
                        <div
                          key={contact.id}
                          className={`birthday-contact-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                          onClick={() => handleSelectContact(contact)}
                        >
                          <div className="birthday-contact-info">
                            <div className="birthday-contact-name">
                              {contact.favorite && <span className="favorite-icon">⭐</span>}
                              {contact.name}
                            </div>
                            <div className="birthday-contact-date">
                              {contact.birthday && (
                                <>
                                  {formatBirthdayShort(contact.birthday)} • Turning {getNextAge(contact.birthday)}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="birthday-days-until">
                            {contact.birthday && getDaysUntilBirthday(contact.birthday) === 0 ? (
                              <span className="days-badge today">Today!</span>
                            ) : contact.birthday && getDaysUntilBirthday(contact.birthday) === 1 ? (
                              <span className="days-badge tomorrow">Tomorrow</span>
                            ) : (
                              <span className="days-badge">
                                {contact.birthday && `${getDaysUntilBirthday(contact.birthday)} days`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : selectedGroup ? (
        <div className="contacts-middle">
          <div className="middle-header">
            {isRenamingGroup ? (
              <div className="rename-group-form">
                <input
                  type="text"
                  className="rename-group-input"
                  placeholder="Group title..."
                  value={renameGroupTitle}
                  onChange={(e) => setRenameGroupTitle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && renameGroupTitle.trim()) {
                      handleSaveRenameGroup();
                    }
                  }}
                  autoFocus
                />
                <div className="rename-actions">
                  <button
                    onClick={handleSaveRenameGroup}
                    disabled={saving}
                    className="btn-save-rename"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelRenameGroup}
                    disabled={saving}
                    className="btn-cancel-rename"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="group-header-info">
                  <h2>{selectedGroup.title}</h2>
                  {selectedGroup.archived && <span className="group-archived-label">Archived</span>}
                </div>
                <div className="group-actions">
                  <button onClick={handleStartRenameGroup} className="btn-icon" title="Rename group">
                    ✏️
                  </button>
                  <button 
                    onClick={handleToggleArchiveGroup} 
                    className="btn-icon"
                    title={selectedGroup.archived ? 'Unarchive group' : 'Archive group'}
                  >
                    {selectedGroup.archived ? '📂' : '📦'}
                  </button>
                  <button onClick={handleDeleteGroup} className="btn-icon-danger" title="Delete group">
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="middle-actions">
            <button onClick={handleCreateContact} className="btn-new-contact">
              + New Contact
            </button>
          </div>

          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="contacts-list">
            {visibleContacts.length === 0 ? (
              <div className="empty-state">
                {searchQuery ? 'No contacts match your search.' : showArchived ? 'No contacts in this group.' : 'No active contacts. Create one!'}
              </div>
            ) : (
              visibleContacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`contact-item ${selectedContact?.id === contact.id ? 'active' : ''} ${contact.archived ? 'archived' : ''}`}
                  onClick={() => handleSelectContact(contact)}
                >
                  <div className="contact-header">
                    <div className="contact-name">
                      {contact.favorite && <span className="favorite-icon">⭐</span>}
                      {contact.archived && <span className="archived-icon">📦</span>}
                      {contact.name}
                    </div>
                  </div>
                  {contact.email && (
                    <div className="contact-preview">✉️ {contact.email}</div>
                  )}
                  {contact.phone && (
                    <div className="contact-preview">📱 {contact.phone}</div>
                  )}
                  {contact.birthday && (
                    <div className="contact-preview">
                      🎂 {formatBirthdayShort(contact.birthday)}
                      {getDaysUntilBirthday(contact.birthday) <= 30 && (
                        <span className="birthday-soon"> • {getDaysUntilBirthday(contact.birthday)} days</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Right Panel - Contact Details */}
      <div className="contacts-content">
        {selectedContact || isEditing ? (
          <>
            <div className="editor-header">
              {isEditing ? (
                <>
                  <button onClick={handleSaveContact} disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancelEdit} disabled={saving} className="btn-secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="contact-actions-left">
                    <button onClick={handleEdit} className="btn-primary">
                      Edit
                    </button>
                    <button 
                      onClick={handleToggleFavoriteContact} 
                      className={`btn-secondary ${selectedContact?.favorite ? 'active' : ''}`}
                      title={selectedContact?.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {selectedContact?.favorite ? '⭐ Favorite' : '☆ Favorite'}
                    </button>
                    <button 
                      onClick={handleToggleArchiveContact} 
                      className="btn-secondary"
                      title={selectedContact?.archived ? 'Unarchive contact' : 'Archive contact'}
                    >
                      {selectedContact?.archived ? '📂 Unarchive' : '📦 Archive'}
                    </button>
                  </div>
                  <button onClick={handleDeleteContact} className="btn-danger">
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
                  className="name-input"
                  placeholder="Contact name..."
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <div className="contact-fields">
                  <div className="field-group">
                    <label>Email</label>
                    <input
                      type="email"
                      className="field-input"
                      placeholder="email@example.com"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      className="field-input"
                      placeholder="+1 (555) 123-4567"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Birthday</label>
                    <input
                      type="date"
                      className="field-input"
                      value={editBirthday}
                      onChange={(e) => setEditBirthday(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Address</label>
                    <textarea
                      className="field-textarea"
                      placeholder="Street address, city, state, ZIP..."
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="field-group">
                    <label>Notes</label>
                    <textarea
                      className="field-textarea"
                      placeholder="Additional notes..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={5}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="viewer">
                <div className="view-header">
                  <h1 className="view-name">{selectedContact?.name}</h1>
                  <div className="view-badges">
                    {selectedContact?.favorite && <span className="badge-favorite">⭐ Favorite</span>}
                    {selectedContact?.archived && <span className="badge-archived">📦 Archived</span>}
                  </div>
                </div>
                <div className="view-details">
                  {selectedContact?.email && (
                    <div className="detail-row">
                      <div className="detail-label">✉️ Email</div>
                      <div className="detail-value">
                        <a href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a>
                      </div>
                    </div>
                  )}
                  {selectedContact?.phone && (
                    <div className="detail-row">
                      <div className="detail-label">📱 Phone</div>
                      <div className="detail-value">
                        <a href={`tel:${selectedContact.phone}`}>{selectedContact.phone}</a>
                      </div>
                    </div>
                  )}
                  {selectedContact?.birthday && (
                    <div className="detail-row">
                      <div className="detail-label">🎂 Birthday</div>
                      <div className="detail-value">
                        {formatBirthday(selectedContact.birthday)}
                        <span className="birthday-info">
                          {' '}({getAge(selectedContact.birthday)} years old)
                        </span>
                        {getDaysUntilBirthday(selectedContact.birthday) <= 90 && (
                          <div className="birthday-upcoming">
                            🎉 Turning {getNextAge(selectedContact.birthday)} in {getDaysUntilBirthday(selectedContact.birthday)} days
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedContact?.address && (
                    <div className="detail-row">
                      <div className="detail-label">📍 Address</div>
                      <div className="detail-value">{selectedContact.address}</div>
                    </div>
                  )}
                  {selectedContact?.notes && (
                    <div className="detail-row">
                      <div className="detail-label">📝 Notes</div>
                      <div className="detail-value notes-content">{selectedContact.notes}</div>
                    </div>
                  )}
                  {!selectedContact?.email && !selectedContact?.phone && !selectedContact?.birthday && !selectedContact?.address && !selectedContact?.notes && (
                    <div className="no-details">No additional details available</div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-center">
            <div className="empty-icon">👤</div>
            <h3>
              {selectedGroup 
                ? 'Select a contact or create a new one' 
                : 'Select a group to view contacts'}
            </h3>
            {selectedGroup && (
              <button onClick={handleCreateContact} className="btn-primary">
                Create Contact
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
