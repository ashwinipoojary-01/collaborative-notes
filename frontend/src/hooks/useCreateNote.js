import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Star, Users } from 'lucide-react';
import { notesApi } from '../api/client';
import { useToast } from '../context/ToastContext';

export const SECTIONS = [
  { key: 'mine', label: 'My Notes', icon: FileText },
  { key: 'shared', label: 'Shared With Me', icon: Users },
  { key: 'favorites', label: 'Favorites', icon: Star },
];

export function useCreateNote() {
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const create = async () => {
    setCreating(true);
    try {
      const { note } = await notesApi.create({ title: '', content: '' });
      navigate(`/notes/${note.id}`, { state: { isNew: true } });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };
  return { create, creating };
}

