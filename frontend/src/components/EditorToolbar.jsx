import {
  Bold, Heading1, Heading2, Heading3, Italic, List, ListChecks, ListOrdered, Quote, Redo2, Strikethrough, Undo2,
} from 'lucide-react';

function ToolButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
        active
          ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />;

export default function EditorToolbar({ editor }) {
  if (!editor) return null;
  const chain = () => editor.chain().focus();
  const icon = 'h-4 w-4';
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 className={icon} /></ToolButton>
      <ToolButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={icon} /></ToolButton>
      <ToolButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={icon} /></ToolButton>
      <Divider />
      <ToolButton label="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><Bold className={icon} /></ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><Italic className={icon} /></ToolButton>
      <ToolButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><Strikethrough className={icon} /></ToolButton>
      <Divider />
      <ToolButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}><List className={icon} /></ToolButton>
      <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={icon} /></ToolButton>
      <ToolButton label="Checklist" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}><ListChecks className={icon} /></ToolButton>
      <ToolButton label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}><Quote className={icon} /></ToolButton>
      <Divider />
      <ToolButton label="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 className={icon} /></ToolButton>
      <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 className={icon} /></ToolButton>
    </div>
  );
}
