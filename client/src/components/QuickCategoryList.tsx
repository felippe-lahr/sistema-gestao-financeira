/**
 * QuickCategoryList — Lista hierárquica de categorias para uso dentro de Popovers
 *
 * Exibe categorias pai com seta expansível. Ao clicar na seta, expande as subcategorias.
 * Ao clicar em qualquer categoria (pai ou sub), chama onSelect com o id.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
  color?: string | null;
  type?: string;
  parentId?: number | null;
  isActive?: boolean;
}

interface QuickCategoryListProps {
  categories: Category[];
  filterType?: string;
  onSelect: (categoryId: number) => void;
}

export function QuickCategoryList({ categories, filterType, onSelect }: QuickCategoryListProps) {
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set());

  const filtered = categories.filter((c) => {
    if (c.isActive === false) return false;
    if (!filterType) return true;
    return c.type === filterType || c.type === "BOTH";
  });

  const parentCategories = filtered.filter((c) => !c.parentId);
  const getSubcategories = (parentId: number) => filtered.filter((c) => c.parentId === parentId);

  const toggleExpand = (parentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  if (parentCategories.length === 0) {
    return <p className="text-xs text-muted-foreground px-2 py-2">Nenhuma categoria cadastrada</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto">
      {parentCategories.map((parent) => {
        const subs = getSubcategories(parent.id);
        const isExpanded = expandedParents.has(parent.id);

        return (
          <div key={parent.id}>
            {/* Linha da categoria pai */}
            <div className="flex items-center hover:bg-accent rounded">
              {/* Botão de expansão */}
              {subs.length > 0 ? (
                <button
                  type="button"
                  onClick={(e) => toggleExpand(parent.id, e)}
                  className="flex-shrink-0 p-1 pl-1.5 text-muted-foreground hover:text-foreground"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />
                  }
                </button>
              ) : (
                <span className="w-6 flex-shrink-0" />
              )}

              {/* Clique na categoria pai */}
              <button
                type="button"
                onClick={() => onSelect(parent.id)}
                className="flex flex-1 items-center gap-2 py-1.5 pr-2 text-sm text-left"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: parent.color || "#6B7280" }}
                />
                <span className="font-medium truncate">{parent.name}</span>
                {subs.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{subs.length}</span>
                )}
              </button>
            </div>

            {/* Subcategorias */}
            {isExpanded && subs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelect(sub.id)}
                className="flex w-full items-center gap-2 pl-7 pr-2 py-1.5 text-sm hover:bg-accent rounded text-left"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sub.color || parent.color || "#6B7280" }}
                />
                <span className="text-muted-foreground truncate">{sub.name}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
