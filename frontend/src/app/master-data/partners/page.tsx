'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Download } from 'lucide-react';
// xlsx-js-style removed — unused in this page
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, PartnerGroup, Partner, Channel } from '@/lib/api';

type Tab = 'groups' | 'partners';

export default function PartnersPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('partners');

  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsPageSize, setGroupsPageSize] = useState(20);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsFilters, setGroupsFilters] = useState<Record<string, string>>({ search: '' });

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersTotal, setPartnersTotal] = useState(0);
  const [partnersPage, setPartnersPage] = useState(1);
  const [partnersPageSize, setPartnersPageSize] = useState(20);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersFilters, setPartnersFilters] = useState<{search: string, group_code: string[], channel: string[]}>({ search: '', group_code: [], channel: [] });

  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [showPartnerGroupDropdown, setShowPartnerGroupDropdown] = useState(false);

  const [activeChannels, setActiveChannels] = useState<Channel[]>([]);
  const [allGroups, setAllGroups] = useState<PartnerGroup[]>([]);
  useEffect(() => {
    const fetchAll = async () => {
      try {
        let all: PartnerGroup[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.partnerGroups.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllGroups(all);
      } catch (e) {
        console.error("Failed to fetch all partner groups", e);
      }
    };
    const fetchChannels = async () => {
      try {
        let all: Channel[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.channels.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setActiveChannels(all.filter(c => c.status === 'Active'));
      } catch (e) {
        console.error("Failed to fetch channels", e);
      }
    };
    fetchAll();
    fetchChannels();
  }, []);

  // Build channel options as {code, name} from active channels + any existing codes in groups
  const channelOptions = useMemo(() => {
    const map = new Map<string, string>();
    activeChannels.forEach(c => map.set(c.channel_code, c.channel_name));
    // Include any group channel codes not in active channels (edge case: inactive/missing)
    allGroups.forEach(g => { if (g.channel && !map.has(g.channel)) map.set(g.channel, g.channel); });
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, activeChannels]);

  // Helper: resolve channel code to display name
  const getChannelName = useCallback((channelCode: string) => {
    const ch = activeChannels.find(c => c.channel_code === channelCode);
    return ch ? ch.channel_name : channelCode;
  }, [activeChannels]);

  const derivedPartnerGroups = useMemo(() => {
    const filtered = partnersFilters.channel.length > 0
      ? allGroups.filter(g => partnersFilters.channel.includes(g.channel))
      : allGroups;
    const unique: {code: string, name: string}[] = [];
    const seen = new Set();
    for (const g of filtered) {
      if (g.partner_grp_code && !seen.has(g.partner_grp_code)) {
        seen.add(g.partner_grp_code);
        unique.push({ code: g.partner_grp_code, name: g.partner_grp_name });
      }
    }
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, partnersFilters.channel]);

  // Reset partner group filter when channel changes and selected groups are no longer valid
  useEffect(() => {
    if (partnersFilters.group_code.length > 0) {
      const validCodes = partnersFilters.group_code.filter(c => derivedPartnerGroups.some(pg => pg.code === c));
      if (validCodes.length !== partnersFilters.group_code.length) {
        setPartnersFilters(prev => ({ ...prev, group_code: validCodes }));
        setPartnersPage(1);
      }
    }
  }, [derivedPartnerGroups, partnersFilters.group_code]);

  const [searchInput, setSearchInput] = useState(partnersFilters.search || '');
  useEffect(() => {
    const timer = setTimeout(() => {
      setPartnersFilters(prev => {
        if (prev.search !== searchInput) {
          setPartnersPage(1);
          return { ...prev, search: searchInput };
        }
        return prev;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Derive enriched partners
  const displayedPartners = useMemo(() => {
    return partners.map(p => {
      const group = allGroups.find(g => g.partner_grp_code === p.partner_grp_code);
      return {
        ...p,
        channel: group ? getChannelName(group.channel) : 'Unknown',
        group_name: group ? group.partner_grp_name : p.partner_grp_code
      };
    });
  }, [partners, allGroups]);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PartnerGroup | null>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [deletePartnerTarget, setDeletePartnerTarget] = useState<Partner | null>(null);

  const [groupForm, setGroupForm] = useState({
    channel: '', partner_grp_type: 'Customer',
    partner_grp_code: '', partner_grp_name: '', status: 'Active',
  });
  const [partnerForm, setPartnerForm] = useState({
    partner_grp_code: '', partner_code: '', partner_name: '',
    partner_mst_code: '', partner_address: '', status: 'Active',
  });

  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await masterDataApi.partnerGroups.list({
        page: groupsPage, page_size: groupsPageSize, search: groupsFilters.search || undefined,
      });
      setGroups(res.items); setGroupsTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load partner groups', (e as Error).message); }
    finally { setGroupsLoading(false); }
  }, [groupsPage, groupsPageSize, groupsFilters, addToast]);

  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      if (partnersFilters.channel.length > 0 && partnersFilters.group_code.length === 0) {
        const validGroupCodes = allGroups.filter(g => partnersFilters.channel.includes(g.channel)).map(g => g.partner_grp_code);
        if (validGroupCodes.length === 0) {
          setPartners([]); setPartnersTotal(0);
        } else {
          const promises = validGroupCodes.map(code => 
            masterDataApi.partners.list({ page: 1, page_size: 100, search: partnersFilters.search || undefined, group_code: code })
          );
          const results = await Promise.all(promises);
          let allChannelPartners: Partner[] = [];
          for (const res of results) {
            allChannelPartners = [...allChannelPartners, ...res.items];
          }
          setPartnersTotal(allChannelPartners.length);
          const start = (partnersPage - 1) * partnersPageSize;
          setPartners(allChannelPartners.slice(start, start + partnersPageSize));
        }
      } else if (partnersFilters.group_code.length > 0) {
        const promises = partnersFilters.group_code.map(code => 
          masterDataApi.partners.list({ page: 1, page_size: 100, search: partnersFilters.search || undefined, group_code: code })
        );
        const results = await Promise.all(promises);
        let allGroupPartners: Partner[] = [];
        for (const res of results) {
          allGroupPartners = [...allGroupPartners, ...res.items];
        }
        setPartnersTotal(allGroupPartners.length);
        const start = (partnersPage - 1) * partnersPageSize;
        setPartners(allGroupPartners.slice(start, start + partnersPageSize));
      } else {
        const res = await masterDataApi.partners.list({
          page: partnersPage, page_size: partnersPageSize,
          search: partnersFilters.search || undefined,
        });
        setPartners(res.items); setPartnersTotal(res.total);
      }
    } catch (e) { addToast('error', 'Failed to load partners', (e as Error).message); }
    finally { setPartnersLoading(false); }
  }, [partnersPage, partnersPageSize, partnersFilters, allGroups, addToast]);

  useEffect(() => { if (tab === 'groups') fetchGroups(); }, [tab, fetchGroups]);
  useEffect(() => { if (tab === 'partners') fetchPartners(); }, [tab, fetchPartners]);

  const handleSaveGroup = async () => {
    setSaving(true);
    try {
      if (editingGroup) {
        await masterDataApi.partnerGroups.update(editingGroup.partner_grp_code, {
          partner_grp_name: groupForm.partner_grp_name, channel: groupForm.channel,
          partner_grp_type: groupForm.partner_grp_type, status: groupForm.status,
        });
        addToast('success', 'Partner group updated');
      } else {
        await masterDataApi.partnerGroups.create(groupForm as unknown as PartnerGroup);
        addToast('success', 'Partner group created');
      }
      setShowGroupModal(false); setEditingGroup(null); fetchGroups();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleSavePartner = async () => {
    setSaving(true);
    try {
      if (editingPartner) {
        await masterDataApi.partners.update(editingPartner.partner_code, {
          partner_grp_code: partnerForm.partner_grp_code, partner_name: partnerForm.partner_name,
          partner_mst_code: partnerForm.partner_mst_code, partner_address: partnerForm.partner_address, status: partnerForm.status,
        });
        addToast('success', 'Partner updated');
      } else {
        await masterDataApi.partners.create(partnerForm as unknown as Partner);
        addToast('success', 'Partner created');
      }
      setShowPartnerModal(false); setEditingPartner(null); fetchPartners();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDeletePartner = async () => {
    if (!deletePartnerTarget) return;
    setDeleting(true);
    try {
      await masterDataApi.partners.delete(deletePartnerTarget.partner_code);
      addToast('success', 'Partner deleted'); setDeletePartnerTarget(null); fetchPartners();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setDeleting(false); }
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await masterDataApi.partnerGroups.delete(deleteTarget.partner_grp_code);
      addToast('success', 'Partner group deleted'); setDeleteTarget(null); fetchGroups();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setDeleting(false); }
  };

  const openEditGroup = (g: PartnerGroup) => {
    setEditingGroup(g);
    setGroupForm({ channel: g.channel, partner_grp_type: g.partner_grp_type, partner_grp_code: g.partner_grp_code, partner_grp_name: g.partner_grp_name, status: g.status });
    setShowGroupModal(true);
  };

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({ channel: channelOptions[0]?.code || '', partner_grp_type: 'Customer', partner_grp_code: '', partner_grp_name: '', status: 'Active' });
    setShowGroupModal(true);
  };

  const openCreatePartner = () => {
    setEditingPartner(null);
    setPartnerForm({ partner_grp_code: '', partner_code: '', partner_name: '', partner_mst_code: '', partner_address: '', status: 'Active' });
    setShowPartnerModal(true);
  };

  const openEditPartner = (p: Partner) => {
    setEditingPartner(p);
    setPartnerForm({ partner_grp_code: p.partner_grp_code, partner_code: p.partner_code, partner_name: p.partner_name, partner_mst_code: p.partner_mst_code || '', partner_address: p.partner_address || '', status: p.status });
    setShowPartnerModal(true);
  };

  const handleExportExcel = useCallback(() => {
    if (tab === 'groups') {
      const exportRows = groups.map(g => ({
        'Code': g.partner_grp_code,
        'Name': g.partner_grp_name,
        'Channel': getChannelName(g.channel),
        'Type': g.partner_grp_type,
        'Status': g.status,
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Partner Groups');
      XLSX.writeFile(wb, `Partner_Groups_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const exportRows = displayedPartners.map(r => ({
        'Channel': r.channel,
        'Partner Group': r.group_name,
        'Code': r.partner_code,
        'Name': r.partner_name,
        'Address': r.partner_address || '',
        'Tax Code': r.partner_mst_code || '',
        'Status': r.status,
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 14 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Partners');
      XLSX.writeFile(wb, `Partners_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  }, [tab, groups, displayedPartners]);

  const groupColumns: Column<PartnerGroup>[] = [
    { key: 'partner_grp_code', header: 'Code', width: '120px', render: (r) => <span>{r.partner_grp_code}</span> },
    { key: 'partner_grp_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.partner_grp_name}</span> },
    { key: 'channel', header: 'Channel', width: '130px', render: (r) => <span>{getChannelName(r.channel)}</span> },
    { key: 'partner_grp_type', header: 'Type', width: '110px', render: (r) => <span className={`badge ${r.partner_grp_type === 'Customer' ? 'badge-success' : 'badge-info'}`}>{r.partner_grp_type}</span> },
    { key: 'status', header: 'Status', width: '100px' },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditGroup(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const partnerColumns: Column<any>[] = [
    { key: 'channel', header: 'Channel', width: '120px', render: (r) => r.channel },
    { key: 'group_name', header: 'Partner Group', width: '160px', render: (r) => r.group_name },
    { key: 'partner_code', header: 'Code', width: '120px', render: (r) => <span>{r.partner_code}</span> },
    { key: 'partner_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.partner_name}</span> },
    { key: 'partner_address', header: 'Address', render: (r) => r.partner_address || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'partner_mst_code', header: 'Tax Code', width: '120px', render: (r) => r.partner_mst_code || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'status', header: 'Status', width: '100px' },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditPartner(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeletePartnerTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  // Removed filter config since we render inline

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Partners</h1>
          <p className="page-description">Manage partner groups and individual business partners</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            <Download size={16} /> Export Excel
          </button>
          <ImportExcel entityKey={tab === 'groups' ? 'partner-groups' : 'partners'} entityLabel={tab === 'groups' ? 'Partner Groups' : 'Partners'} onImportComplete={tab === 'groups' ? fetchGroups : fetchPartners} />
          <button className="btn btn-primary" onClick={tab === 'groups' ? openCreateGroup : openCreatePartner}>
            <Plus size={16} /> {tab === 'groups' ? 'Add Group' : 'Add Partner'}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${tab === 'partners' ? 'tab-active' : ''}`} onClick={() => setTab('partners')}>Partners</button>
        <button className={`tab-item ${tab === 'groups' ? 'tab-active' : ''}`} onClick={() => setTab('groups')}>Partner Groups</button>
      </div>

      {tab === 'groups' && (<>
        <FilterBar searchPlaceholder="Search groups..." onFilterChange={(f) => { setGroupsFilters(f); setGroupsPage(1); }} />
        <DataTable columns={groupColumns} data={groups} loading={groupsLoading} rowKey={(r) => r.id} />
        <Pagination page={groupsPage} pageSize={groupsPageSize} total={groupsTotal} onPageChange={setGroupsPage} onPageSizeChange={(s) => { setGroupsPageSize(s); setGroupsPage(1); }} />
      </>)}

      {tab === 'partners' && (<>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)',
          padding: '0 0 var(--space-4)',
          alignItems: 'center',
        }}>
          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowChannelDropdown(!showChannelDropdown); setShowPartnerGroupDropdown(false); }}
            >
              {partnersFilters.channel.length > 0 ? `${partnersFilters.channel.length} Channels Selected` : 'All Channels'}
            </div>
            {showChannelDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {channelOptions.map(c => (
                  <label key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={partnersFilters.channel.includes(c.code)}
                      onChange={e => {
                        const nc = e.target.checked ? [...partnersFilters.channel, c.code] : partnersFilters.channel.filter(x => x !== c.code);
                        setPartnersFilters(prev => ({ ...prev, channel: nc }));
                        setPartnersPage(1);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 200, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowPartnerGroupDropdown(!showPartnerGroupDropdown); setShowChannelDropdown(false); }}
            >
              {partnersFilters.group_code.length > 0 ? `${partnersFilters.group_code.length} Groups Selected` : 'All Partner Groups'}
            </div>
            {showPartnerGroupDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {derivedPartnerGroups.map(pg => (
                  <label key={pg.code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={partnersFilters.group_code.includes(pg.code)}
                      onChange={e => {
                        const nc = e.target.checked ? [...partnersFilters.group_code, pg.code] : partnersFilters.group_code.filter(x => x !== pg.code);
                        setPartnersFilters(prev => ({ ...prev, group_code: nc }));
                        setPartnersPage(1);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{pg.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search partners..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{
                padding: '8px 14px 8px 32px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
                outline: 'none',
                width: '250px'
              }}
            />
          </div>

          {(partnersFilters.channel.length > 0 || partnersFilters.group_code.length > 0 || searchInput) && (
            <button
              onClick={() => { 
                setPartnersFilters({ search: '', group_code: [], channel: [] }); 
                setSearchInput('');
                setPartnersPage(1); 
              }}
              style={{
                padding: '8px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-md)',
                color: '#ef4444',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
        <DataTable columns={partnerColumns} data={displayedPartners} loading={partnersLoading} rowKey={(r) => r.id} />
        <Pagination page={partnersPage} pageSize={partnersPageSize} total={partnersTotal} onPageChange={setPartnersPage} onPageSizeChange={(s) => { setPartnersPageSize(s); setPartnersPage(1); }} />
      </>)}

      <Modal isOpen={showGroupModal} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} title={editingGroup ? 'Edit Partner Group' : 'New Partner Group'} size="md"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowGroupModal(false); setEditingGroup(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSaveGroup} disabled={saving}>{saving && <span className="loading-spinner" />}{editingGroup ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Channel *</label><select className="form-input form-select" value={groupForm.channel} onChange={(e) => setGroupForm({ ...groupForm, channel: e.target.value })}><option value="">Select channel...</option>{channelOptions.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Type *</label><select className="form-input form-select" value={groupForm.partner_grp_type} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_type: e.target.value })}><option value="Customer">Customer</option><option value="Supplier">Supplier</option></select></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Code *</label><input className="form-input" placeholder="e.g. CG-001" value={groupForm.partner_grp_code} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_code: e.target.value })} disabled={!!editingGroup} /></div>
          <div className="form-group"><label className="form-label">Name *</label><input className="form-input" placeholder="Group name" value={groupForm.partner_grp_name} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_name: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-input form-select" value={groupForm.status} onChange={(e) => setGroupForm({ ...groupForm, status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
      </Modal>

      <Modal isOpen={showPartnerModal} onClose={() => { setShowPartnerModal(false); setEditingPartner(null); }} title={editingPartner ? 'Edit Partner' : 'New Partner'} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowPartnerModal(false); setEditingPartner(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSavePartner} disabled={saving}>{saving && <span className="loading-spinner" />}{editingPartner ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Partner Group *</label><select className="form-input form-select" value={partnerForm.partner_grp_code} onChange={(e) => setPartnerForm({ ...partnerForm, partner_grp_code: e.target.value })}><option value="">Select group...</option>{groups.map(g => <option key={g.partner_grp_code} value={g.partner_grp_code}>{g.partner_grp_name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Code *</label><input className="form-input" placeholder="e.g. BP-001" value={partnerForm.partner_code} onChange={(e) => setPartnerForm({ ...partnerForm, partner_code: e.target.value })} disabled={!!editingPartner} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Name *</label><input className="form-input" placeholder="Business name" value={partnerForm.partner_name} onChange={(e) => setPartnerForm({ ...partnerForm, partner_name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Tax Code</label><input className="form-input" placeholder="Tax code" value={partnerForm.partner_mst_code} onChange={(e) => setPartnerForm({ ...partnerForm, partner_mst_code: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Address</label><input className="form-input" placeholder="Full address" value={partnerForm.partner_address} onChange={(e) => setPartnerForm({ ...partnerForm, partner_address: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-input form-select" value={partnerForm.status} onChange={(e) => setPartnerForm({ ...partnerForm, status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteGroup} loading={deleting}
        title="Delete Partner Group" message={`Delete "${deleteTarget?.partner_grp_name}"? Partners in this group may be affected.`} />

      <ConfirmDialog isOpen={!!deletePartnerTarget} onClose={() => setDeletePartnerTarget(null)} onConfirm={handleDeletePartner} loading={deleting}
        title="Delete Partner" message={`Are you sure you want to delete "${deletePartnerTarget?.partner_name}"?`} />
    </div>
  );
}
