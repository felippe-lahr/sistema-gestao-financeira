import { Resend } from "resend";
import { ENV } from "./env";

const resend = new Resend(ENV.resendApiKey);

const FROM_EMAIL = "Gestão Financeira <noreply@unifiquepro.com.br>";

/**
 * Envia e-mail de verificação de conta para um novo usuário.
 */
export async function sendVerificationEmail(params: {
  to: string;
  name: string;
  verificationUrl: string;
}): Promise<void> {
  const { to, name, verificationUrl } = params;

  const firstName = name.split(" ")[0];

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Confirme seu e-mail — Gestão Financeira",
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirme seu e-mail</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e293b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                💰 Gestão Financeira
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:600;">
                Olá, ${firstName}! 👋
              </h2>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Obrigado por criar sua conta. Para ativar o acesso ao sistema, confirme seu endereço de e-mail clicando no botão abaixo.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:8px;">
                    <a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      ✅ Confirmar meu e-mail
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.5;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:0;color:#94a3b8;font-size:12px;word-break:break-all;">
                ${verificationUrl}
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                Este link expira em <strong>24 horas</strong>. Se você não criou esta conta, ignore este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
  if (error) {
    console.error("[Resend] Erro ao enviar e-mail de verificação:", JSON.stringify(error));
    throw new Error(`Falha ao enviar e-mail: ${error.message ?? JSON.stringify(error)}`);
  }
  console.log("[Resend] E-mail de verificação enviado:", data?.id, "para", to);
}

/**
 * Envia e-mail de boas-vindas após a verificação ser concluída.
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  organizationName: string;
}): Promise<void> {
  const { to, name, organizationName } = params;
  const firstName = name.split(" ")[0];
  const loginUrl = `${ENV.appUrl}/`;

  const { data: welcomeData, error: welcomeError } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Bem-vindo ao Gestão Financeira, ${firstName}!`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo!</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e293b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                💰 Gestão Financeira
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:600;">
                Conta ativada com sucesso! 🎉
              </h2>
              <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                Olá, <strong>${firstName}</strong>! Sua conta foi verificada e a organização <strong>${organizationName}</strong> está pronta para uso.
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Agora você pode acessar o sistema e começar a gerenciar suas finanças.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:8px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      🚀 Acessar o sistema
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                Você recebeu este e-mail porque criou uma conta no Gestão Financeira.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
  if (welcomeError) {
    console.error("[Resend] Erro ao enviar e-mail de boas-vindas:", JSON.stringify(welcomeError));
    throw new Error(`Falha ao enviar e-mail de boas-vindas: ${welcomeError.message ?? JSON.stringify(welcomeError)}`);
  }
  console.log("[Resend] E-mail de boas-vindas enviado:", welcomeData?.id, "para", to);
}
