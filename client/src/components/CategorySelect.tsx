/**
 * CategorySelect — Seletor hierárquico de categorias
 *
 * Exibe categorias pai com seta expansível. Ao clicar na seta, expande as subcategorias
 * com indentação. O usuário pode selecionar tanto a categoria pai quanto a subcategoria.
 *
 * Props:
 *  - categories: lista de categorias (com campo parentId opcional)
 *  - value: id da categoria selecionada (string ou null)
 *  - onValueChange: callback com o id selecionado
 *  - placeholder: texto do placeholder
 *  - filterType: filtrar por tipo ("INCOME" | "EXPENSE" | "BOTH" | undefined = sem filtro)
 *  - includeAll: se true, adiciona opção "Todas" com value="all"
 *  - className: classes adicionais para o trigger
 *  - disabled: desabilita o seletor
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
  color?: string | null;
  type?: string;
  parentId?: number | null;
  isActive?: boolean;
}

interface CategorySelectProps {
  categories: Category[];
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  filterType?: "INCOME" | "EXPENSE" | "BOTH" | string;
  includeAll?: boolean;
  className?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

export function CategorySelect({
  categories,
  value,
  onValueChange,
  placeholder = "Selecionar categoria...",
  filterType,
  includeAll = false,
  className,
  disabled = false,
  triggerClassName,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtrar categorias ativas e pelo tipo se necessário
  const filtered = categories.filter((c) => {
    if (c.isActive === false) return false;
    if (!filterType) return true;
    return c.type === filterType || c.type === "BOTH";
  });

  const parentCategories = filtered.filter((c) => !c.parentId);
  const getSubcategories = (parentId: number) => filtered.filter((c) => c.parentId === parentId);

  // Encontrar categoria selecionada para exibir no trigger
  const selectedCategory = value && value !== "all" ? categories.find((c) => c.id.toString() === value) : null;
  const selectedParent = selectedCategory?.parentId
    ? categories.find((c) => c.id === selectedCategory.parentId)
    : null;

  const displayLabel = value === "all"
    ? "Todas"
    : selectedCategory
      ? selectedParent
        ? `${selectedParent.name} › ${selectedCategory.name}`
        : selectedCategory.name
      : null;

  const displayColor = selectedCategory?.color
    || selectedParent?.color
    || null;

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Expandir automaticamente o pai da categoria selecionada ao abrir
  useEffect(() => {
    if (open && selectedCategory?.parentId) {
      setExpandedParents((prev) => new Set([...prev, selectedCategory.parentId!]));
    }
  }, [open, selectedCategory]);

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

  const handleSelect = (val: string) => {
    onValueChange(val);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-1 ring-ring",
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {displayColor && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: displayColor }}
            />
          )}
          <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
            {displayLabel || placeholder}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {/* Opção "Todas" */}
          {includeAll && (
            <button
              type="button"
              onClick={() => handleSelect("all")}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                value === "all" && "bg-accent"
              )}
            >
              <Check className={cn("h-3.5 w-3.5 flex-shrink-0", value === "all" ? "opacity-100" : "opacity-0")} />
              Todas
            </button>
          )}

          {parentCategories.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma categoria encontrada</p>
          )}

          {parentCategories.map((parent) => {
            const subs = getSubcategories(parent.id);
            const isExpanded = expandedParents.has(parent.id);
            const isSelected = value === parent.id.toString();

            return (
              <div key={parent.id}>
                {/* Linha da categoria pai */}
                <div
                  className={cn(
                    "flex items-center gap-1 hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent"
                  )}
                >
                  {/* Botão de expansão (apenas se tiver subcategorias) */}
                  {subs.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(parent.id, e)}
                      className="flex-shrink-0 p-1 pl-2 hover:text-foreground text-muted-foreground"
                      title={isExpanded ? "Recolher subcategorias" : "Expandir subcategorias"}
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
                    onClick={() => handleSelect(parent.id.toString())}
                    className="flex flex-1 items-center gap-2 py-2 pr-3 text-sm text-left"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: parent.color || "#6B7280" }}
                    />
                    <span className="font-medium truncate">{parent.name}</span>
                    {subs.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {subs.length}
                      </span>
                    )}
                    <Check className={cn("h-3.5 w-3.5 flex-shrink-0 ml-1", isSelected ? "opacity-100" : "opacity-0")} />
                  </button>
                </div>

                {/* Subcategorias expandidas */}
                {isExpanded && subs.map((sub) => {
                  const isSubSelected = value === sub.id.toString();
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelect(sub.id.toString())}
                      className={cn(
                        "flex w-full items-center gap-2 pl-8 pr-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                        isSubSelected && "bg-accent"
                      )}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sub.color || parent.color || "#6B7280" }}
                      />
                      <span className="truncate text-muted-foreground">{sub.name}</span>
                      <Check className={cn("h-3.5 w-3.5 flex-shrink-0 ml-auto", isSubSelected ? "opacity-100" : "opacity-0")} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
