import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Lock, Mail } from "lucide-react";

export default function UserProfile() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao correspondem");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      
      if (response.ok) {
        toast.success("Senha alterada com sucesso!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setIsChangingPassword(false);
      } else {
        toast.error(data.error || "Erro ao alterar senha");
      }
    } catch (error) {
      toast.error("Erro ao alterar senha");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground">Gerencie suas informacoes pessoais e seguranca</p>
      </div>

      <div className="space-y-6">
        {/* Informacoes do Usuario */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informacoes Pessoais
            </CardTitle>
            <CardDescription>Seus dados de cadastro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <div className="p-3 bg-muted rounded-lg">
                {user?.name || "Nao informado"}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <div className="p-3 bg-muted rounded-lg">
                {user?.email || "Nao informado"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alterar Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Seguranca
            </CardTitle>
            <CardDescription>Altere sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            {isChangingPassword ? (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Senha Atual</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="Digite sua senha atual"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Digite a nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirme a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Alterando..." : "Alterar Senha"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsChangingPassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={() => setIsChangingPassword(true)}>
                Alterar Senha
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
