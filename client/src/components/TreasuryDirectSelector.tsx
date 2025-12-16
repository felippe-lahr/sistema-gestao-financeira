import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface TreasuryDirectSelectorProps {
  onTitleSelected: (title: any) => void;
  isLoading?: boolean;
}

const TREASURY_CATEGORIES = [
  { value: "SELIC", label: "Selic" },
  { value: "IPCA", label: "IPCA+" },
  { value: "EDUCAC", label: "Educa+" },
  { value: "RENDA", label: "Renda+" },
  { value: "PREFIXADO", label: "Prefixado" },
];

export function TreasuryDirectSelector({ onTitleSelected, isLoading }: TreasuryDirectSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTitle, setSelectedTitle] = useState<string>("");
  const utils = trpc.useUtils();

  // Query para títulos da categoria selecionada
  const { data: titles } = trpc.treasuryDirect.getTitlesByCategory.useQuery(
    { category: selectedCategory as any },
    { enabled: !!selectedCategory }
  );

  // Mutation para atualizar cache
  const refreshMutation = trpc.treasuryDirect.refreshCache.useMutation({
    onSuccess: () => {
      utils.treasuryDirect.getTitlesByCategory.invalidate();
      toast.success("Preços do Tesouro Direto atualizados!");
      setSelectedCategory("");
      setSelectedTitle("");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  // Quando um título é selecionado
  useEffect(() => {
    if (selectedTitle && titles) {
      const title = titles.find((t: any) => t.code === selectedTitle);
      if (title) {
        onTitleSelected(title);
      }
    }
  }, [selectedTitle, titles, onTitleSelected]);

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tesouro Direto</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Atualizar Preços
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">Categoria *</Label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {TREASURY_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="title">Título *</Label>
          <Select value={selectedTitle} onValueChange={setSelectedTitle} disabled={!titles || titles.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o título" />
            </SelectTrigger>
            <SelectContent>
              {titles?.map((title: any) => (
                <SelectItem key={title.code} value={title.code}>
                  {title.name} ({title.profitability})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {titles && titles.length > 0 && selectedTitle && (
        <div className="bg-blue-50 p-3 rounded text-sm text-blue-900">
          <p>
            <strong>Preço Unitário:</strong> R${((titles.find((t: any) => t.code === selectedTitle)?.unitaryPrice || 0) / 100).toFixed(2)}
          </p>
          <p>
            <strong>Investimento Mínimo:</strong> R${((titles.find((t: any) => t.code === selectedTitle)?.minimumInvestment || 0) / 100).toFixed(2)}
          </p>
          <p>
            <strong>Vencimento:</strong> {titles.find((t: any) => t.code === selectedTitle)?.maturityDate}
          </p>
        </div>
      )}
    </div>
  );
}
