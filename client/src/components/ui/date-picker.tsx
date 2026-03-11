import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** Valor no formato "yyyy-MM-dd" (compatível com input type=date) */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * DatePicker em pt-BR que substitui <input type="date">.
 * Recebe e retorna strings no formato "yyyy-MM-dd" para manter
 * compatibilidade com o restante da aplicação.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  className,
  id,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Converte "yyyy-MM-dd" → Date para o Calendar
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Converte Date → "yyyy-MM-dd" para manter compatibilidade
      onChange?.(format(date, "yyyy-MM-dd"));
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selectedDate
            ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={ptBR}
          initialFocus
          footer={
            <div className="flex justify-between px-3 pb-3 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-primary text-xs h-7"
                onClick={handleClear}
              >
                Limpar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary text-xs h-7"
                onClick={() => {
                  handleSelect(new Date());
                }}
              >
                Hoje
              </Button>
            </div>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
