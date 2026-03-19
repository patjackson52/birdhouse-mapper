'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SpeciesForm from '@/components/admin/SpeciesForm';
import SpeciesCard from '@/components/admin/SpeciesCard';

export default function SpeciesPage() {
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSpecies, setEditingSpecies] = useState<Species | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSpecies();
  }, []);

  async function fetchSpecies() {
    const supabase = createClient();
    const { data } = await supabase
      .from('species')
      .select('*')
      .order('sort_order', { ascending: true });
    if (data) setSpeciesList(data);
    setLoading(false);
  }

  function handleSaved(saved: Species) {
    if (editingSpecies) {
      setSpeciesList((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      setSpeciesList((prev) => [...prev, saved]);
    }
    setEditingSpecies(undefined);
    setShowAdd(false);
  }

  async function handleDelete(species: Species) {
    setError('');
    const supabase = createClient();

    const [itemRes, updateRes] = await Promise.all([
      supabase.from('item_species').select('*', { count: 'exact', head: true }).eq('species_id', species.id),
      supabase.from('update_species').select('*', { count: 'exact', head: true }).eq('species_id', species.id),
    ]);

    const itemCount = itemRes.count || 0;
    const updateCount = updateRes.count || 0;

    if (itemCount > 0 || updateCount > 0) {
      setError(`Cannot delete "${species.name}": associated with ${itemCount} item${itemCount === 1 ? '' : 's'} and ${updateCount} observation${updateCount === 1 ? '' : 's'}.`);
      return;
    }

    if (!confirm(`Delete "${species.name}"?`)) return;

    const { error: err } = await supabase.from('species').delete().eq('id', species.id);
    if (err) {
      setError(err.message);
    } else {
      setSpeciesList((prev) => prev.filter((s) => s.id !== species.id));
    }
  }

  const categories = [...new Set(speciesList.map((s) => s.category).filter(Boolean))] as string[];
  const statuses = [...new Set(speciesList.map((s) => s.conservation_status).filter(Boolean))] as string[];

  const filtered = speciesList.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.scientific_name || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterStatus && s.conservation_status !== filterStatus) return false;
    return true;
  });

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Species</h1>
        {!showAdd && !editingSpecies && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            + Add Species
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
      )}

      {(showAdd || editingSpecies) && (
        <div className="mb-6">
          <SpeciesForm
            species={editingSpecies}
            onSaved={handleSaved}
            onCancel={() => { setShowAdd(false); setEditingSpecies(undefined); }}
          />
        </div>
      )}

      {speciesList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field flex-1 min-w-[200px]"
            placeholder="Search by name..."
          />
          {categories.length > 0 && (
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-field w-auto">
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {statuses.length > 0 && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-auto">
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {speciesList.length === 0 && !showAdd && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No species added yet. Add your first species to start tracking wildlife.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            + Add Your First Species
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((species) => (
          <SpeciesCard
            key={species.id}
            species={species}
            onEdit={() => setEditingSpecies(species)}
            onDelete={() => handleDelete(species)}
          />
        ))}
      </div>

      {speciesList.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sage py-8">No species match your search.</p>
      )}
    </div>
  );
}
