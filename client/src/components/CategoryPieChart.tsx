import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

interface CategoryPieChartProps {
  data: Array<{
    name: string;
    value: number;
  }>;
  title?: string;
  description?: string;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function CategoryPieChart({
  data,
  title = "Distribuição por Categoria",
  description = "Proporção de despesas por categoria",
  colors = DEFAULT_COLORS,
}: CategoryPieChartProps) {
  // Ordenar dados em ordem decrescente
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card className="card-hover">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, sortedData.length * 40)}>
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={190} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => `${value}%`}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: `1px solid var(--border)`,
                borderRadius: "0.5rem",
              }}
            />
            <Bar dataKey="value" fill="#8884d8" radius={[0, 8, 8, 0]}>
              {sortedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
