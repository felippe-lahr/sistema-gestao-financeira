#!/bin/bash

# Script para iniciar a aplicação em produção
cd /home/ubuntu/sistema-gestao-financeira

# Definir variáveis de ambiente
export NODE_ENV=production
export PORT=3000

# Iniciar a aplicação
exec node dist/index.js
