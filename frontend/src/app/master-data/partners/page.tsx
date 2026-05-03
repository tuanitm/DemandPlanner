'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, PartnerGroup, Partner } from '@/lib/api';

type Tab = 'groups' | 'partners';

export default function PartnersPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('groups');

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
  const [partnersFilters, setPartnersFilters] = useState<Record<string, string>>({ search: '', group_code: '' });

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PartnerGroup | null>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [groupForm, setGroupForm] = useState({
    channel: 'Domestic', partner_grp_type: 'Customer',
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
      const res = await masterDataApi.partners.list({
        page: partnersPage, page_size: partnersPageSize,
        search: partnersFilters.search || undefined,
        group_code: partnersFilters.group_code || undefined,
      });
      setPartners(res.items); setPartnersTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load partners', (e as Error).message); }
    finally { setPartnersLoading(false); }
  }, [partnersPage, partnersPageSize, partnersFilters, addToast]);

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
      await masterDataApi.partners.create(partnerForm as unknown as Partner);
      addToast('success', 'Partner created');
      setShowPartnerModal(false); fetchPartners();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
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
    setGroupForm({ channel: 'Domestic', partner_grp_type: 'Customer', partner_grp_code: '', partner_grp_name: '', status: 'Active' });
    setShowGroupModal(true);
  };

  const openCreatePartner = () => {
    setPartnerForm({ partner_grp_code: '', partner_code: '', partner_name: '', partner_mst_code: '', partner_address: '', status: 'Active' });
    setShowPartnerModal(true);
  };

  const groupColumns: Column<PartnerGroup>[] = [
    { key: 'partner_grp_code', header: 'Code', width: '120px', render: (r) => <span className="badge badge-info">{r.partner_grp_code}</span> },
    { key: 'partner_grp_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.partner_grp_name}</span> },
    { key: 'channel', header: 'Channel', width: '130px' },
    { key: 'partner_grp_type', header: 'Type', width: '110px', render: (r) => <span className={`badge ${r.partner_grp_type === 'Customer' ? 'badge-success' : 'badge-info'}`}>{r.partner_grp_type}</span> },
    { key: 'status', header: 'Status', width: '100px', render: (r) => <span className={`badge ${r.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span> },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditGroup(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const partnerColumns: Column<Partner>[] = [
    { key: 'partner_code', header: 'Code', width: '120px', render: (r) => <span className="badge badge-info">{r.partner_code}</span> },
    { key: 'partner_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.partner_name}</span> },
    { key: 'partner_grp_code', header: 'Group', width: '130px' },
    { key: 'partner_mst_code', header: 'Tax Code', width: '120px', render: (r) => r.partner_mst_code || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'status', header: 'Status', width: '100px', render: (r) => <span className={`badge ${r.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span> },
  ];

  const partnerFilterConfig: FilterConfig[] = [
    { key: 'group_code', label: 'Group', options: [{ value: '', label: 'All Groups' }, ...groups.map(g => ({ value: g.partner_grp_code, label: g.partner_grp_name }))] },
  ];

  const channels = ['Domestic', 'Export', 'E-Commerce', 'Modern Trade', 'General Trade', 'Other'];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Partners</h1>
          <p className="page-description">Manage partner groups and individual business partners</p>
        </div>
        <button className="btn btn-primary" onClick={tab === 'groups' ? openCreateGroup : openCreatePartner}>
          <Plus size={16} /> {tab === 'groups' ? 'Add Group' : 'Add Partner'}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-item ${tab === 'groups' ? 'tab-active' : ''}`} onClick={() => setTab('groups')}>Partner Groups</button>
        <button className={`tab-item ${tab === 'partners' ? 'tab-active' : ''}`} onClick={() => setTab('partners')}>Partners</button>
      </div>

      {tab === 'groups' && (<>
        <FilterBar searchPlaceholder="Search groups..." onFilterChange={(f) => { setGroupsFilters(f); setGroupsPage(1); }} />
        <DataTable columns={groupColumns} data={groups} loading={groupsLoading} rowKey={(r) => r.id} />
        <Pagination page={groupsPage} pageSize={groupsPageSize} total={groupsTotal} onPageChange={setGroupsPage} onPageSizeChange={(s) => { setGroupsPageSize(s); setGroupsPage(1); }} />
      </>)}

      {tab === 'partners' && (<>
        <FilterBar searchPlaceholder="Search partners..." filters={partnerFilterConfig} onFilterChange={(f) => { setPartnersFilters(f); setPartnersPage(1); }} />
        <DataTable columns={partnerColumns} data={partners} loading={partnersLoading} rowKey={(r) => r.id} />
        <Pagination page={partnersPage} pageSize={partnersPageSize} total={partnersTotal} onPageChange={setPartnersPage} onPageSizeChange={(s) => { setPartnersPageSize(s); setPartnersPage(1); }} />
      </>)}

      <Modal isOpen={showGroupModal} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} title={editingGroup ? 'Edit Partner Group' : 'New Partner Group'} size="md"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowGroupModal(false); setEditingGroup(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSaveGroup} disabled={saving}>{saving && <span className="loading-spinner" />}{editingGroup ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Channel *</label><select className="form-input form-select" value={groupForm.channel} onChange={(e) => setGroupForm({ ...groupForm, channel: e.target.value })}>{channels.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Type *</label><select className="form-input form-select" value={groupForm.partner_grp_type} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_type: e.target.value })}><option value="Customer">Customer</option><option value="Supplier">Supplier</option></select></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Code *</label><input className="form-input" placeholder="e.g. CG-001" value={groupForm.partner_grp_code} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_code: e.target.value })} disabled={!!editingGroup} /></div>
          <div className="form-group"><label className="form-label">Name *</label><input className="form-input" placeholder="Group name" value={groupForm.partner_grp_name} onChange={(e) => setGroupForm({ ...groupForm, partner_grp_name: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-input form-select" value={groupForm.status} onChange={(e) => setGroupForm({ ...groupForm, status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
      </Modal>

      <Modal isOpen={showPartnerModal} onClose={() => setShowPartnerModal(false)} title="New Partner" size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => setShowPartnerModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSavePartner} disabled={saving}>{saving && <span className="loading-spinner" />}Create</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Partner Group *</label><select className="form-input form-select" value={partnerForm.partner_grp_code} onChange={(e) => setPartnerForm({ ...partnerForm, partner_grp_code: e.target.value })}><option value="">Select group...</option>{groups.map(g => <option key={g.partner_grp_code} value={g.partner_grp_code}>{g.partner_grp_name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Code *</label><input className="form-input" placeholder="e.g. BP-001" value={partnerForm.partner_code} onChange={(e) => setPartnerForm({ ...partnerForm, partner_code: e.target.value })} /></div>
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
    </div>
  );
}
