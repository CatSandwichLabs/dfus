import { ChevronRight, Home } from 'lucide-react';

export default function FolderBreadcrumb({ path, onNavigate }) {
  // path is an array of objects: [{ id: null, name: 'Root' }, { id: 'folder1', name: 'Documents' }]
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 mb-6 bg-slate-900/50 p-3 rounded-lg border border-white/5 w-fit">
      {path.map((crumb, index) => {
        const isLast = index === path.length - 1;
        
        return (
          <div key={crumb.id || 'root'} className="flex items-center gap-2">
            <button
              onClick={() => !isLast && onNavigate(crumb.id)}
              className={`flex items-center gap-1 hover:text-white transition-colors ${isLast ? 'text-cyan-400 font-semibold' : ''} ${!isLast ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {crumb.id === null && <Home size={16} />}
              {crumb.name}
            </button>
            {!isLast && <ChevronRight size={16} className="opacity-50" />}
          </div>
        );
      })}
    </div>
  );
}
