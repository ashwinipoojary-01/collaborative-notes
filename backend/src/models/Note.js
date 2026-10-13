import mongoose from 'mongoose';

const collaboratorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    permission: { type: String, enum: ['viewer', 'editor'], required: true, default: 'viewer' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 200 },
    content: { type: String, default: '' },
    contentText: { type: String, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: { type: [collaboratorSchema], default: [] },
    favoritedBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    version: { type: Number, default: 1 },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

noteSchema.index({ owner: 1, updatedAt: -1 });
noteSchema.index({ 'collaborators.user': 1, updatedAt: -1 });
noteSchema.index({ favoritedBy: 1 });

export const Note = mongoose.model('Note', noteSchema);
