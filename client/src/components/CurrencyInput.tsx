import { forwardRef, InputHTMLAttributes } from 'react';

interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Componente de input com máscara monetária brasileira (R$ 9.000,00)
 * Formata automaticamente enquanto o usuário digita
 */
const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className = '', ...props }, ref) => {
    
    const formatCurrency = (value: string): string => {
      // Remove tudo que não é dígito
      const digits = value.replace(/\D/g, '');
      
      if (!digits) return '';
      
      // Converte para número (em centavos)
      const amount = parseInt(digits, 10);
      
      // Formata com separadores
      const formatted = (amount / 100).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      
      return formatted;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const formatted = formatCurrency(inputValue);
      onChange(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Permitir: backspace, delete, tab, escape, enter
      if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.key === 'Tab' ||
        e.key === 'Escape' ||
        e.key === 'Enter'
      ) {
        return;
      }

      // Permitir: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      // Permitir apenas números
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    };

    return (
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };

/**
 * Função auxiliar para converter valor formatado (9.000,00) para número (9000.00)
 */
export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  
  // Remove pontos de milhar e substitui vírgula por ponto
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

/**
 * Função auxiliar para converter número (9000.00) para formato brasileiro (9.000,00)
 */
export const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
